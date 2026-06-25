import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getCredentialsStore } from "./credentials";

const API_BASE = "https://api.cloudvps.reg.ru/v1";
const STATE_DIR = path.join(process.cwd(), ".data");
const DEFAULT_STATE_FILE = path.join(STATE_DIR, "regvps-stopped.json");
const REGRU_CREDENTIAL_ID = "ext-regru";

export type RegvpsConfig = {
  token: string;
  dryRun: boolean;
  stateFile: string;
  regletFilter: Set<number> | null;
  accountLogin: string | null;
  accountLabel: string | null;
};

export type RegletInfo = {
  id: number;
  name: string;
  ip: string;
  hostname: string;
  status: string;
  region: string;
  vcpus: number;
  memory: number;
  disk: number;
  sizeName: string;
  imageName: string;
};

export type RegvpsStatus = {
  configured: boolean;
  connected: boolean;
  dryRun: boolean;
  allOff: boolean | null;
  stoppedCount: number;
  runningCount: number;
  totalCount: number;
  reglets: RegletInfo[];
  accountLogin: string | null;
  accountLabel: string | null;
  updatedAt: string;
  error?: string;
  hint?: string;
};

export type RegvpsToggleResult = {
  ok: boolean;
  message: string;
  allOff: boolean | null;
  dryRun: boolean;
};

type RegletApi = {
  id: number;
  name: string;
  ip: string;
  hostname?: string;
  status: string;
  region_slug?: string;
  vcpus?: number;
  memory?: number;
  disk?: number;
  size?: { name?: string };
  image?: { name?: string };
};

type StoppedState = {
  regletIds: number[];
  stoppedAt: string;
};

export class RegvpsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "RegvpsError";
  }
}

async function resolveRegvpsCredentials(): Promise<{
  token: string | null;
  accountLogin: string | null;
  accountLabel: string | null;
}> {
  const fromEnv = process.env.REGVPS_API_TOKEN ?? process.env.CLOUDVPS_REGRU_TOKEN;
  if (fromEnv?.trim()) {
    return { token: fromEnv.trim(), accountLogin: null, accountLabel: null };
  }

  const store = await getCredentialsStore();
  const entry = store?.categories
    .flatMap((c) => c.entries)
    .find((e) => e.id === REGRU_CREDENTIAL_ID);

  if (entry?.apiToken?.trim()) {
    return {
      token: entry.apiToken.trim(),
      accountLogin: entry.username ?? null,
      accountLabel: entry.label ?? "Reg.ru",
    };
  }

  return {
    token: null,
    accountLogin: entry?.username ?? null,
    accountLabel: entry?.label ?? null,
  };
}

export async function getRegvpsConfig(): Promise<RegvpsConfig | null> {
  const { token, accountLogin, accountLabel } = await resolveRegvpsCredentials();
  if (!token) return null;

  const filterRaw = process.env.REGVPS_REGLET_IDS;
  const regletFilter = filterRaw
    ? new Set(
        filterRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n)),
      )
    : null;

  return {
    token,
    dryRun: process.env.REGVPS_DRY_RUN !== "false",
    stateFile: process.env.REGVPS_STATE_FILE ?? DEFAULT_STATE_FILE,
    regletFilter: regletFilter && regletFilter.size > 0 ? regletFilter : null,
    accountLogin,
    accountLabel,
  };
}

async function readStoppedState(file: string): Promise<StoppedState | null> {
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoppedState>;
    if (!Array.isArray(parsed.regletIds)) return null;
    return {
      regletIds: parsed.regletIds,
      stoppedAt: parsed.stoppedAt ?? "",
    };
  } catch {
    return null;
  }
}

async function writeStoppedState(file: string, state: StoppedState | null): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  if (!state?.regletIds?.length) {
    try {
      await unlink(file);
    } catch {
      // ignore
    }
    return;
  }
  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

async function regvpsFetch<T>(
  config: RegvpsConfig,
  pathPart: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${pathPart}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new RegvpsError(
      body.error || body.message || `Reg.ru Cloud VPS: HTTP ${response.status}`,
      response.status,
    );
  }

  return body as T;
}

function mapReglet(r: RegletApi): RegletInfo {
  return {
    id: r.id,
    name: r.name,
    ip: r.ip,
    hostname: r.hostname ?? "",
    status: r.status,
    region: r.region_slug ?? "",
    vcpus: r.vcpus ?? 0,
    memory: r.memory ?? 0,
    disk: r.disk ?? 0,
    sizeName: r.size?.name ?? "",
    imageName: r.image?.name ?? "",
  };
}

function filterReglets(config: RegvpsConfig, reglets: RegletInfo[]): RegletInfo[] {
  const manageable = reglets.filter(
    (r) =>
      r.status === "active" ||
      r.status === "off" ||
      r.status === "new" ||
      r.status === "suspended",
  );
  if (!config.regletFilter) return manageable;
  return manageable.filter((r) => config.regletFilter!.has(r.id));
}

export async function listReglets(config: RegvpsConfig): Promise<RegletInfo[]> {
  const data = await regvpsFetch<{ reglets?: RegletApi[] }>(config, "/reglets");
  return filterReglets(config, (data.reglets ?? []).map(mapReglet));
}

async function regletAction(
  config: RegvpsConfig,
  regletId: number,
  type: "start" | "stop" | "reboot",
): Promise<void> {
  if (config.dryRun) return;

  await regvpsFetch(config, `/reglets/${regletId}/actions`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

function setupHint(login: string | null): string {
  const who = login ? ` (${login})` : "";
  return `Войдите в Reg.ru${who} → Облачные VPS → Настройки → скопируйте «Токен API» и добавьте в credentials.json (поле apiToken у «Рег.ру») или REGVPS_API_TOKEN в .env.local`;
}

export async function getRegvpsStatus(): Promise<RegvpsStatus> {
  const { token, accountLogin, accountLabel } = await resolveRegvpsCredentials();
  const updatedAt = new Date().toISOString();

  if (!token) {
    return {
      configured: false,
      connected: false,
      dryRun: process.env.REGVPS_DRY_RUN !== "false",
      allOff: null,
      stoppedCount: 0,
      runningCount: 0,
      totalCount: 0,
      reglets: [],
      accountLogin,
      accountLabel,
      updatedAt,
      error: setupHint(accountLogin),
    };
  }

  const config = await getRegvpsConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      dryRun: true,
      allOff: null,
      stoppedCount: 0,
      runningCount: 0,
      totalCount: 0,
      reglets: [],
      accountLogin,
      accountLabel,
      updatedAt,
      error: setupHint(accountLogin),
    };
  }

  try {
    const [reglets, state] = await Promise.all([
      listReglets(config),
      readStoppedState(config.stateFile),
    ]);

    const runningCount = reglets.filter((r) => r.status === "active").length;
    const stoppedCount = reglets.filter((r) => r.status === "off").length;
    const stoppedByApp = state?.regletIds?.length ?? 0;

    return {
      configured: true,
      connected: true,
      dryRun: config.dryRun,
      allOff: reglets.length > 0 && runningCount === 0,
      stoppedCount,
      runningCount,
      totalCount: reglets.length,
      reglets,
      accountLogin: config.accountLogin,
      accountLabel: config.accountLabel,
      updatedAt,
      hint: config.dryRun
        ? "Dry-run: команды не отправляются на Reg.ru"
        : stoppedByApp > 0
          ? `Через панель выключено: ${stoppedByApp}`
          : undefined,
    };
  } catch (error) {
    const message =
      error instanceof RegvpsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Неизвестная ошибка";

    return {
      configured: true,
      connected: false,
      dryRun: config.dryRun,
      allOff: null,
      stoppedCount: 0,
      runningCount: 0,
      totalCount: 0,
      reglets: [],
      accountLogin: config.accountLogin,
      accountLabel: config.accountLabel,
      updatedAt,
      error: message,
    };
  }
}

export async function toggleRegvps(action: "off" | "on"): Promise<RegvpsToggleResult> {
  const config = await getRegvpsConfig();

  if (!config) {
    return {
      ok: false,
      message: "Reg.ru не настроен — нужен API-токен (см. подсказку в блоке)",
      allOff: null,
      dryRun: true,
    };
  }

  try {
    const reglets = await listReglets(config);

    if (action === "off") {
      const running = reglets.filter((r) => r.status === "active");
      if (running.length === 0) {
        return {
          ok: true,
          message: "Все серверы уже выключены",
          allOff: true,
          dryRun: config.dryRun,
        };
      }

      if (config.dryRun) {
        return {
          ok: true,
          message: `[Dry-run] Было бы выключено ${running.length} серверов`,
          allOff: true,
          dryRun: true,
        };
      }

      const stoppedIds: number[] = [];
      const failed: string[] = [];

      for (const reglet of running) {
        try {
          await regletAction(config, reglet.id, "stop");
          stoppedIds.push(reglet.id);
        } catch {
          failed.push(reglet.name);
        }
      }

      if (stoppedIds.length === 0) {
        return {
          ok: false,
          message: "Не удалось выключить ни одного сервера",
          allOff: false,
          dryRun: false,
        };
      }

      await writeStoppedState(config.stateFile, {
        regletIds: stoppedIds,
        stoppedAt: new Date().toISOString(),
      });

      const failedNote =
        failed.length > 0 ? ` Не выключены: ${failed.join(", ")}.` : "";

      return {
        ok: failed.length === 0,
        message: `Выключено: ${stoppedIds.length}.${failedNote}`,
        allOff: true,
        dryRun: false,
      };
    }

    const stopped = reglets.filter((r) => r.status === "off");
    if (stopped.length === 0) {
      await writeStoppedState(config.stateFile, null);
      return {
        ok: true,
        message: "Нет выключенных серверов для запуска",
        allOff: false,
        dryRun: config.dryRun,
      };
    }

    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] Было бы включено ${stopped.length} серверов`,
        allOff: false,
        dryRun: true,
      };
    }

    let started = 0;
    const failed: string[] = [];

    for (const reglet of stopped) {
      try {
        await regletAction(config, reglet.id, "start");
        started += 1;
      } catch {
        failed.push(reglet.name);
      }
    }

    await writeStoppedState(config.stateFile, null);

    const failedNote =
      failed.length > 0 ? ` Не включены: ${failed.join(", ")}.` : "";

    return {
      ok: failed.length === 0,
      message: `Включено: ${started}.${failedNote}`,
      allOff: false,
      dryRun: false,
    };
  } catch (error) {
    const message =
      error instanceof RegvpsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Неизвестная ошибка";

    return { ok: false, message, allOff: null, dryRun: config.dryRun };
  }
}

export async function toggleSingleReglet(
  regletId: number,
  type: "start" | "stop" | "reboot",
): Promise<RegvpsToggleResult> {
  const config = await getRegvpsConfig();

  if (!config) {
    return {
      ok: false,
      message: "Reg.ru не настроен",
      allOff: null,
      dryRun: true,
    };
  }

  if (config.regletFilter && !config.regletFilter.has(regletId)) {
    return {
      ok: false,
      message: "Этот сервер не в списке REGVPS_REGLET_IDS",
      allOff: null,
      dryRun: config.dryRun,
    };
  }

  try {
    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] ${type} для сервера #${regletId}`,
        allOff: null,
        dryRun: true,
      };
    }

    await regletAction(config, regletId, type);

    return {
      ok: true,
      message: `Команда «${type}» отправлена`,
      allOff: null,
      dryRun: false,
    };
  } catch (error) {
    const message =
      error instanceof RegvpsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Неизвестная ошибка";

    return { ok: false, message, allOff: null, dryRun: config.dryRun };
  }
}
