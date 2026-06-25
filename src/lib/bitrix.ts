import dns from "node:dns";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

// Браузер часто использует DoH/кэш; Node — системный DNS (у вас 123.23.23.23), он бывает нестабилен
dns.setServers(["8.8.8.8", "1.1.1.1", ...dns.getServers()]);

export type BitrixConfig = {
  webhookUrl: string;
  dryRun: boolean;
  stateFile: string;
  excludeUserIds: Set<string>;
};

export type BitrixStatus = {
  configured: boolean;
  connected: boolean;
  closed: boolean | null;
  lockedUsersCount: number;
  adminUserId?: string;
  canLockUsers?: boolean;
  excludedUserIds?: string[];
  error?: string;
  hint?: string;
};

export type BitrixToggleResult = {
  ok: boolean;
  message: string;
  closed: boolean | null;
  lockedUsersCount?: number;
  dryRun: boolean;
};

type BitrixUser = {
  ID: string;
  ACTIVE: boolean | string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  UF_DEPARTMENT?: number[];
  WORK_POSITION?: string;
  UF_PHONE_INNER?: string;
};

type BitrixResponse<T> = {
  result?: T;
  next?: number;
  error?: string;
  error_description?: string;
};

type UserSnapshot = {
  ID: string;
  UF_DEPARTMENT?: number[];
  WORK_POSITION?: string;
  UF_PHONE_INNER?: string;
};

type LockedState = {
  userIds: string[];
  snapshots: Record<string, UserSnapshot>;
  lockedAt: string;
  adminUserId: string;
};

export class BitrixError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BitrixError";
  }
}

function formatBitrixError(error: unknown): string {
  if (error instanceof BitrixError) {
    return error.message;
  }

  if (!(error instanceof Error)) {
    return "Неизвестная ошибка";
  }

  const msg = error.message.toLowerCase();
  const cause =
    error.cause instanceof Error ? error.cause.message.toLowerCase() : "";

  if (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("getaddrinfo") ||
    cause.includes("enotfound") ||
    cause.includes("getaddrinfo")
  ) {
    return "Нет связи с your-domain.bitrix24.ru — кратковременный сбой DNS. Нажмите «Обновить»; сайт в браузере может открываться, а приложение ходит через другой DNS.";
  }

  if (msg.includes("econnrefused") || msg.includes("econnreset")) {
    return "Bitrix24 недоступен — соединение отклонено. Проверьте интернет и файрвол.";
  }

  if (msg.includes("timeout") || msg.includes("abort")) {
    return "Таймаут при обращении к Bitrix24 — сервер долго не отвечает.";
  }

  return error.message;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const parts = [error.message];
  if (error.cause instanceof Error) parts.push(error.cause.message);

  const msg = parts.join(" ").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("getaddrinfo") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timeout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bitrixFetch(url: string, init: RequestInit): Promise<Response> {
  const retryDelaysMs = [0, 400, 1200, 2500];
  let lastError: unknown;

  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay);
    try {
      return await fetch(url, { ...init, cache: "no-store" });
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error)) throw error;
    }
  }

  throw lastError;
}

const STATE_DIR = path.join(process.cwd(), ".data");
const DEFAULT_STATE_FILE = path.join(STATE_DIR, "bitrix-locked-users.json");

const USER_SELECT = [
  "ID",
  "ACTIVE",
  "NAME",
  "LAST_NAME",
  "EMAIL",
  "UF_DEPARTMENT",
  "WORK_POSITION",
  "UF_PHONE_INNER",
];

function parseExcludeUserIds(webhookOwnerId?: string): Set<string> {
  const fromEnv =
    process.env.BITRIX_EXCLUDE_USER_IDS?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];

  // Администраторы портала не блокируются — у ACTIVE=N сбрасываются права CRM
  const defaults = ["9", "29"];

  return new Set(
    [...defaults, ...fromEnv, ...(webhookOwnerId ? [webhookOwnerId] : [])].filter(
      Boolean,
    ),
  );
}

export function getBitrixConfig(): BitrixConfig | null {
  const webhookUrl =
    process.env.BITRIX24_WEBHOOK_URL ?? process.env.BITRIX_TOGGLE_URL;

  if (!webhookUrl) {
    return null;
  }

  const match = webhookUrl.trim().match(/^(https?:\/\/[^/]+\/rest\/\d+\/[^/]+)/i);
  const normalized = match?.[1] ?? webhookUrl.replace(/\/$/, "").replace(/\.json$/, "");

  return {
    webhookUrl: normalized,
    dryRun: process.env.BITRIX_DRY_RUN === "true",
    stateFile: process.env.BITRIX_STATE_FILE ?? DEFAULT_STATE_FILE,
    excludeUserIds: parseExcludeUserIds(),
  };
}

async function readLockedState(file: string): Promise<LockedState | null> {
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LockedState>;

    if (!Array.isArray(parsed.userIds) || parsed.userIds.length === 0) {
      return null;
    }

    return {
      userIds: parsed.userIds,
      snapshots: parsed.snapshots ?? {},
      lockedAt: parsed.lockedAt ?? "",
      adminUserId: parsed.adminUserId ?? "",
    };
  } catch {
    return null;
  }
}

async function writeLockedState(file: string, state: LockedState | null): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  if (!state?.userIds?.length) {
    try {
      await unlink(file);
    } catch {
      // файл мог не существовать
    }
    return;
  }

  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

async function bitrixCall<T>(
  config: BitrixConfig,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const url = `${config.webhookUrl}/${method}.json`;

  let response: Response;
  try {
    response = await bitrixFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (error) {
    throw new BitrixError(formatBitrixError(error), 0);
  }

  const body = (await response.json().catch(() => ({}))) as BitrixResponse<T>;

  if (!response.ok || body.error) {
    throw new BitrixError(
      body.error_description || body.error || `Bitrix24 API: ${response.status}`,
      response.status,
    );
  }

  return body.result as T;
}

async function getCurrentUser(config: BitrixConfig): Promise<BitrixUser> {
  return bitrixCall<BitrixUser>(config, "user.current");
}

async function getActiveUsers(config: BitrixConfig): Promise<BitrixUser[]> {
  const users: BitrixUser[] = [];
  let start = 0;

  while (true) {
    let page: Response;
    try {
      page = await bitrixFetch(`${config.webhookUrl}/user.get.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          FILTER: { ACTIVE: true },
          SELECT: USER_SELECT,
          start,
        }),
      });
    } catch (error) {
      throw new BitrixError(formatBitrixError(error), 0);
    }

    const body = (await page.json()) as BitrixResponse<BitrixUser[]>;
    if (!page.ok || body.error) {
      throw new BitrixError(
        body.error_description || body.error || `Bitrix24 API: ${page.status}`,
        page.status,
      );
    }

    users.push(...(body.result ?? []));

    if (body.next === undefined || body.next === null) break;
    start = Number(body.next);
    if (!Number.isFinite(start)) break;
  }

  return users;
}

function snapshotFromUser(user: BitrixUser): UserSnapshot {
  return {
    ID: user.ID,
    UF_DEPARTMENT: user.UF_DEPARTMENT,
    WORK_POSITION: user.WORK_POSITION,
    UF_PHONE_INNER: user.UF_PHONE_INNER,
  };
}

async function lockUser(config: BitrixConfig, userId: string): Promise<void> {
  if (config.dryRun) return;

  await bitrixCall(config, "user.update", {
    ID: userId,
    ACTIVE: "N",
  });
}

async function unlockUser(config: BitrixConfig, snapshot: UserSnapshot): Promise<void> {
  if (config.dryRun) return;

  const params: Record<string, unknown> = {
    ID: snapshot.ID,
    ACTIVE: "Y",
  };

  if (snapshot.UF_DEPARTMENT?.length) {
    params.UF_DEPARTMENT = snapshot.UF_DEPARTMENT;
  }
  if (snapshot.WORK_POSITION !== undefined) {
    params.WORK_POSITION = snapshot.WORK_POSITION;
  }
  if (snapshot.UF_PHONE_INNER !== undefined) {
    params.UF_PHONE_INNER = snapshot.UF_PHONE_INNER;
  }

  await bitrixCall(config, "user.update", params);
}

async function tryLockUser(
  config: BitrixConfig,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (config.dryRun) return { ok: true };

  try {
    await lockUser(config, userId);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof BitrixError ? error.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

async function tryUnlockUser(
  config: BitrixConfig,
  snapshot: UserSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (config.dryRun) return { ok: true };

  try {
    await unlockUser(config, snapshot);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof BitrixError ? error.message : "Неизвестная ошибка";
    return { ok: false, error: message };
  }
}

async function checkCanLockUsers(config: BitrixConfig): Promise<boolean> {
  try {
    const isAdmin = await bitrixCall<boolean>(config, "user.admin");
    return isAdmin === true;
  } catch {
    return false;
  }
}

export async function getBitrixStatus(): Promise<BitrixStatus> {
  const config = getBitrixConfig();

  if (!config) {
    return {
      configured: false,
      connected: false,
      closed: null,
      lockedUsersCount: 0,
      error:
        "Задайте BITRIX24_WEBHOOK_URL в .env.local (входящий вебхук Bitrix24)",
    };
  }

  try {
    const [admin, state, canLock] = await Promise.all([
      getCurrentUser(config),
      readLockedState(config.stateFile),
      checkCanLockUsers(config),
    ]);

    const excludeUserIds = parseExcludeUserIds(admin.ID);
    const lockedCount = state?.userIds?.length ?? 0;

    return {
      configured: true,
      connected: true,
      closed: lockedCount > 0,
      lockedUsersCount: lockedCount,
      adminUserId: admin.ID,
      canLockUsers: canLock,
      excludedUserIds: [...excludeUserIds],
      hint: canLock
        ? undefined
        : "Нет прав на блокировку входа. Пересоздайте вебхук под администратором портала (полный scope user).",
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      closed: null,
      lockedUsersCount: 0,
      error: formatBitrixError(error),
    };
  }
}

export async function toggleBitrixAccess(
  action: "open" | "close",
): Promise<BitrixToggleResult> {
  const config = getBitrixConfig();

  if (!config) {
    return {
      ok: false,
      message: "Bitrix24 не настроен — нужен входящий вебхук",
      closed: null,
      dryRun: true,
    };
  }

  try {
    if (action === "close") {
      const existing = await readLockedState(config.stateFile);

      const admin = await getCurrentUser(config);
      const excludeUserIds = parseExcludeUserIds(admin.ID);
      const canLock = await checkCanLockUsers(config);
      if (!canLock) {
        return {
          ok: false,
          message:
            "Нет прав на блокировку входа (access_denied). Пересоздайте вебхук под администратором портала Bitrix24.",
          closed: false,
          dryRun: false,
        };
      }

      const activeUsers = await getActiveUsers(config);
      const alreadyLocked = new Set(existing?.userIds ?? []);
      const toLock = activeUsers.filter(
        (u) => !excludeUserIds.has(u.ID) && !alreadyLocked.has(u.ID),
      );

      if (existing?.userIds?.length && toLock.length === 0) {
        return {
          ok: true,
          message: `Вход уже закрыт (${existing.userIds.length} сотрудников)`,
          closed: true,
          dryRun: config.dryRun,
        };
      }

      if (config.dryRun) {
        const total = (existing?.userIds?.length ?? 0) + toLock.length;
        return {
          ok: true,
          message: `[Dry-run] Было бы заблокирован вход для ${total} сотрудников (${excludeUserIds.size} админов пропущено)`,
          closed: true,
          dryRun: true,
        };
      }

      const lockedIds: string[] = [...(existing?.userIds ?? [])];
      const snapshots: Record<string, UserSnapshot> = {
        ...(existing?.snapshots ?? {}),
      };
      const skipped: Array<{ id: string; name: string; error: string }> = [];
      let newlyLocked = 0;

      for (const user of toLock) {
        const result = await tryLockUser(config, user.ID);
        if (result.ok) {
          lockedIds.push(user.ID);
          snapshots[user.ID] = snapshotFromUser(user);
          newlyLocked += 1;
        } else {
          const label = [user.NAME, user.LAST_NAME].filter(Boolean).join(" ") || user.EMAIL || user.ID;
          skipped.push({ id: user.ID, name: label, error: result.error });
        }
      }

      if (lockedIds.length === 0) {
        return {
          ok: false,
          message:
            "Не удалось заблокировать ни одного сотрудника. Проверьте права вебхука.",
          closed: false,
          dryRun: false,
        };
      }

      await writeLockedState(config.stateFile, {
        userIds: lockedIds,
        snapshots,
        lockedAt: existing?.lockedAt ?? new Date().toISOString(),
        adminUserId: admin.ID,
      });

      const skippedNote =
        skipped.length > 0
          ? ` Не заблокированы: ${skipped.map((s) => `${s.name} (${s.id})`).join(", ")}.`
          : "";
      const excludedNote =
        excludeUserIds.size > 1
          ? ` Администраторы не блокируются: ${[...excludeUserIds].filter((id) => id !== admin.ID).join(", ")}.`
          : "";
      const syncNote =
        existing?.userIds?.length && newlyLocked > 0
          ? ` Дозаблокировано пропущенных: ${newlyLocked}.`
          : "";

      return {
        ok: true,
        message: `Вход заблокирован для ${lockedIds.length} сотрудников. Данные и профили сохранены — только вход по паролю закрыт.${syncNote}${excludedNote}${skippedNote}`,
        closed: true,
        lockedUsersCount: lockedIds.length,
        dryRun: false,
      };
    }

    const state = await readLockedState(config.stateFile);
    if (!state?.userIds?.length) {
      return {
        ok: true,
        message: "Вход уже открыт",
        closed: false,
        dryRun: config.dryRun,
      };
    }

    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] Было бы разблокировано ${state.userIds.length} сотрудников`,
        closed: false,
        dryRun: true,
      };
    }

    let restored = 0;
    const failed: string[] = [];

    for (const userId of state.userIds) {
      const snapshot = state.snapshots[userId] ?? { ID: userId };
      const result = await tryUnlockUser(config, snapshot);
      if (result.ok) {
        restored += 1;
      } else {
        failed.push(userId);
      }
    }

    await writeLockedState(config.stateFile, null);

    const failedNote =
      failed.length > 0 ? ` Не восстановлено: ${failed.length} (проверьте вручную в Bitrix).` : "";

    return {
      ok: failed.length === 0,
      message: `Вход открыт: разблокировано ${restored} сотрудников.${failedNote}`,
      closed: false,
      dryRun: false,
    };
  } catch (error) {
    let message = formatBitrixError(error);
    if (message.includes("access_denied")) {
      message =
        "Bitrix24: нет прав блокировать вход. Нужен вебхук от администратора портала.";
    }

    return { ok: false, message, closed: null, dryRun: config.dryRun };
  }
}
