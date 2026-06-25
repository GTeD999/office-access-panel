import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import type { AccountActionResult, Yandex360Status, YandexMailUser } from "./types";
import { isAccountsDryRun } from "./config";

const API = "https://api360.yandex.net";
const STATE_DIR = path.join(process.cwd(), ".data");
const DEFAULT_STATE_FILE = path.join(STATE_DIR, "yandex360-stopped.json");

type StoppedState = {
  userIds: string[];
  stoppedAt: string;
};

type YandexUserRaw = {
  id: string | number;
  email?: string;
  name?: { first?: string; last?: string; middle?: string };
  position?: string;
  isAdmin?: boolean;
  isRobot?: boolean;
  isEnabled?: boolean;
  isDismissed?: boolean;
  displayName?: string;
};

function defaultLinks() {
  return {
    admin: "https://admin.yandex.ru/users",
    oauth: "https://oauth.yandex.ru/",
  };
}

function yandexStateFile(): string {
  return process.env.YANDEX360_STATE_FILE ?? DEFAULT_STATE_FILE;
}

export function getYandexProtectedEmails(): Set<string> {
  const raw =
    process.env.YANDEX360_PROTECT_EMAILS ??
    "admin@example.com,helpdesk@example.com";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canYandexResetPassword(user: YandexMailUser): boolean {
  if (user.isRobot || user.isDismissed) return false;
  return true;
}

/** Разлогинить на всех устройствах — активные сотрудники, не роботы */
export function canYandexLogoutSessions(user: YandexMailUser): boolean {
  if (user.isRobot || user.isDismissed) return false;
  return true;
}

/** Отключение учётки — не для админов и защищённых ящиков */
export function canYandexDisableUser(user: YandexMailUser): boolean {
  if (user.isRobot || user.isDismissed) return false;
  if (user.isAdmin) return false;
  if (getYandexProtectedEmails().has(user.email.toLowerCase())) return false;
  return true;
}

/** @deprecated use canYandexDisableUser */
export function isYandexUserManageable(user: YandexMailUser): boolean {
  return canYandexDisableUser(user);
}

function mapUser(u: YandexUserRaw): YandexMailUser {
  const parts = [u.name?.last, u.name?.first, u.name?.middle].filter(Boolean);
  return {
    id: String(u.id),
    email: u.email ?? "",
    name: u.displayName || parts.join(" ") || u.email || "—",
    position: u.position,
    isAdmin: u.isAdmin === true,
    isRobot: u.isRobot === true,
    isEnabled: u.isEnabled !== false,
    isDismissed: u.isDismissed === true,
  };
}

function formatYandexError(error: unknown, context?: "sessions"): string {
  const message = error instanceof Error ? error.message : "Ошибка Yandex 360 API";
  if (message === "forbidden") {
    if (context === "sessions") {
      return "Нет прав ya360_security:domain_sessions_write в OAuth-токене";
    }
    return "Нет прав на этого пользователя (админ, робот или защищённая учётка)";
  }
  return message;
}

async function readStoppedState(file: string): Promise<StoppedState | null> {
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoppedState>;
    if (!Array.isArray(parsed.userIds)) return null;
    return { userIds: parsed.userIds, stoppedAt: parsed.stoppedAt ?? "" };
  } catch {
    return null;
  }
}

async function writeStoppedState(
  file: string,
  state: StoppedState | null,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  if (!state?.userIds?.length) {
    try {
      await unlink(file);
    } catch {
      // ignore
    }
    return;
  }
  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

async function yandexFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: T | Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as T) : {};
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    throw new Error(err);
  }

  return data as T;
}

async function listYandexUsers(
  orgId: string,
  oauthToken: string,
): Promise<YandexMailUser[]> {
  const users: YandexMailUser[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= 20) {
    const data = await yandexFetch<{ users?: YandexUserRaw[]; pages?: number }>(
      oauthToken,
      `/directory/v1/org/${orgId}/users?page=${page}&perPage=${perPage}`,
    );

    for (const u of data.users ?? []) {
      users.push(mapUser(u));
    }

    if (!data.users?.length || (data.pages && page >= data.pages)) break;
    page += 1;
  }

  users.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return users;
}

function summarizeUsers(
  users: YandexMailUser[],
  bulkStoppedIds: string[],
): Pick<
  Yandex360Status,
  "enabledCount" | "disabledCount" | "manageableActiveCount" | "bulkStoppedCount"
> {
  const manageable = users.filter(canYandexDisableUser);
  const enabledCount = users.filter((u) => u.isEnabled && !u.isDismissed).length;
  const disabledCount = users.filter((u) => !u.isEnabled && !u.isDismissed).length;
  const manageableActiveCount = manageable.filter((u) => u.isEnabled).length;
  const bulkStoppedCount = bulkStoppedIds.filter((id) =>
    users.some((u) => u.id === id && !u.isEnabled),
  ).length;

  return {
    enabledCount,
    disabledCount,
    manageableActiveCount,
    bulkStoppedCount,
  };
}

export async function getYandex360Status(
  orgId?: string,
  oauthToken?: string,
): Promise<Yandex360Status> {
  const base: Yandex360Status = {
    configured: !!(orgId && oauthToken),
    connected: false,
    orgId,
    users: [],
    totalUsers: 0,
    enabledCount: 0,
    disabledCount: 0,
    manageableActiveCount: 0,
    bulkStoppedCount: 0,
    links: defaultLinks(),
  };

  if (!orgId || !oauthToken) {
    return {
      ...base,
      error: "Задайте YANDEX360_OAUTH_TOKEN и YANDEX360_ORG_ID",
      hint: "OAuth: directory:read_users, directory:write_users, ya360_security:domain_sessions_write — https://oauth.yandex.ru/",
    };
  }

  try {
    const users = await listYandexUsers(orgId, oauthToken);
    const stopped = await readStoppedState(yandexStateFile());
    const summary = summarizeUsers(users, stopped?.userIds ?? []);

    return {
      ...base,
      connected: true,
      users,
      totalUsers: users.length,
      ...summary,
    };
  } catch (error) {
    return {
      ...base,
      error: formatYandexError(error),
    };
  }
}

export async function yandexResetPassword(
  orgId: string,
  oauthToken: string,
  userId: string,
  newPassword: string,
  user?: YandexMailUser,
  passwordChangeRequired = true,
): Promise<AccountActionResult> {
  if (user && !canYandexResetPassword(user)) {
    return {
      ok: false,
      dryRun: isAccountsDryRun(),
      message: "Нельзя сменить пароль этому пользователю (робот или уволен)",
    };
  }

  const dryRun = isAccountsDryRun();
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: `[Dry-run] Пароль ${user?.email ?? userId} был бы сменён`,
      data: user ? { email: user.email, name: user.name } : undefined,
    };
  }

  try {
    await yandexFetch(oauthToken, `/directory/v1/org/${orgId}/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({
        password: newPassword,
        passwordChangeRequired,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      dryRun: false,
      message: formatYandexError(error),
    };
  }

  return {
    ok: true,
    dryRun: false,
    message: passwordChangeRequired
      ? `Пароль обновлён для ${user?.email ?? userId}. При входе потребуется смена пароля`
      : `Пароль обновлён для ${user?.email ?? userId}`,
    data: {
      password: newPassword,
      email: user?.email,
      name: user?.name,
      passwordChangeRequired,
    },
  };
}

export async function yandexSetUserEnabled(
  orgId: string,
  oauthToken: string,
  userId: string,
  enabled: boolean,
  user?: YandexMailUser,
): Promise<AccountActionResult> {
  if (user && !canYandexDisableUser(user)) {
    return {
      ok: false,
      dryRun: isAccountsDryRun(),
      message: user.isAdmin
        ? "Нельзя отключить администратора организации"
        : "Нельзя изменить статус этому пользователю",
    };
  }

  const dryRun = isAccountsDryRun();
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: `[Dry-run] ${user?.email ?? userId}: ${enabled ? "включить" : "отключить"}`,
    };
  }

  try {
    await yandexFetch(oauthToken, `/directory/v1/org/${orgId}/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isEnabled: enabled }),
    });
  } catch (error) {
    return {
      ok: false,
      dryRun: false,
      message: formatYandexError(error),
    };
  }

  return {
    ok: true,
    dryRun: false,
    message: enabled
      ? `${user?.email ?? "Учётная запись"} включена`
      : `${user?.email ?? "Учётная запись"} отключена`,
  };
}

export async function yandexLogoutAllSessions(
  orgId: string,
  oauthToken: string,
  userId: string,
  user?: YandexMailUser,
): Promise<AccountActionResult> {
  if (user && !canYandexLogoutSessions(user)) {
    return {
      ok: false,
      dryRun: isAccountsDryRun(),
      message: "Нельзя разлогинить робота или уволенного сотрудника",
    };
  }

  const dryRun = isAccountsDryRun();
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      message: `[Dry-run] ${user?.email ?? userId}: выход на всех устройствах`,
    };
  }

  try {
    await yandexFetch(
      oauthToken,
      `/security/v1/org/${orgId}/domain_sessions/users/${userId}/logout`,
      { method: "PUT" },
    );
  } catch (error) {
    return {
      ok: false,
      dryRun: false,
      message: formatYandexError(error, "sessions"),
    };
  }

  return {
    ok: true,
    dryRun: false,
    message: `${user?.email ?? "Сотрудник"} разлогинен на всех устройствах (пароли приложений сброшены)`,
    data: user ? { email: user.email, name: user.name } : undefined,
  };
}

export async function yandexToggleAllUsers(
  orgId: string,
  oauthToken: string,
  action: "off" | "on",
): Promise<AccountActionResult> {
  const dryRun = isAccountsDryRun();
  const stateFile = yandexStateFile();

  try {
    const users = await listYandexUsers(orgId, oauthToken);
    const manageable = users.filter(canYandexDisableUser);

    if (action === "off") {
      const toDisable = manageable.filter((u) => u.isEnabled);
      if (toDisable.length === 0) {
        return {
          ok: true,
          dryRun,
          message: "Нет активных учёток для отключения",
        };
      }

      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          message: `[Dry-run] Было бы отключено ${toDisable.length} учёток`,
        };
      }

      const disabledIds: string[] = [];
      const failed: string[] = [];

      for (const user of toDisable) {
        const result = await yandexSetUserEnabled(
          orgId,
          oauthToken,
          user.id,
          false,
          user,
        );
        if (result.ok) disabledIds.push(user.id);
        else failed.push(user.email);
      }

      if (disabledIds.length === 0) {
        return { ok: false, dryRun: false, message: "Не удалось отключить ни одной учётки" };
      }

      await writeStoppedState(stateFile, {
        userIds: disabledIds,
        stoppedAt: new Date().toISOString(),
      });

      const failedNote =
        failed.length > 0 ? ` Не отключены: ${failed.join(", ")}.` : "";

      return {
        ok: failed.length === 0,
        dryRun: false,
        message: `Отключено учёток: ${disabledIds.length}.${failedNote}`,
      };
    }

    const state = await readStoppedState(stateFile);
    const toEnable = state?.userIds?.length
      ? manageable.filter((u) => state.userIds.includes(u.id) && !u.isEnabled)
      : manageable.filter((u) => !u.isEnabled);

    if (toEnable.length === 0) {
      await writeStoppedState(stateFile, null);
      return {
        ok: true,
        dryRun,
        message: "Нет отключённых учёток для включения",
      };
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        message: `[Dry-run] Было бы включено ${toEnable.length} учёток`,
      };
    }

    let enabled = 0;
    const failed: string[] = [];

    for (const user of toEnable) {
      const result = await yandexSetUserEnabled(
        orgId,
        oauthToken,
        user.id,
        true,
        user,
      );
      if (result.ok) enabled += 1;
      else failed.push(user.email);
    }

    await writeStoppedState(stateFile, null);

    const failedNote =
      failed.length > 0 ? ` Не включены: ${failed.join(", ")}.` : "";

    return {
      ok: failed.length === 0,
      dryRun: false,
      message: `Включено учёток: ${enabled}.${failedNote}`,
    };
  } catch (error) {
    return {
      ok: false,
      dryRun,
      message: formatYandexError(error),
    };
  }
}

export function generatePassword(length = 14): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
