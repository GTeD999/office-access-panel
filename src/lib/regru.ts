import { getCredentialsStore } from "./credentials";
import {
  getHostingPanel,
  hostingDisplayLabel,
  listHostingSites,
  loadHostingSitesForService,
  toggleHostingSite,
} from "./regru-hosting";

const API_BASE = "https://api.reg.ru/api/regru2";
const REGRU_CREDENTIAL_ID = "ext-regru";

const HOSTING_SERVTYPES = new Set([
  "srv_hosting_ispmgr",
  "srv_hosting_cpanel",
  "srv_hosting_plesk",
]);

const MANAGED_SERVTYPES = new Set([...HOSTING_SERVTYPES, "srv_dedicated"]);

const SERVTYPE_LABELS: Record<string, string> = {
  srv_hosting_ispmgr: "Хостинг",
  srv_hosting_cpanel: "Хостинг cPanel",
  srv_hosting_plesk: "Хостинг Plesk",
  srv_dedicated: "Выделенный сервер",
};

export type RegruConfig = {
  username: string;
  password: string;
  dryRun: boolean;
  accountLabel: string | null;
};

export type RegruServiceKind = "hosting" | "dedicated";

export type RegruServiceInfo = {
  serviceId: string;
  kind: RegruServiceKind;
  domain: string;
  plan: string;
  servtype: string;
  typeLabel: string;
  status: "active" | "suspended" | "inactive";
  expirationDate: string;
  label: string;
  sites?: Array<{ domain: string; enabled: boolean }>;
  panelConnected?: boolean;
  panelError?: string;
};

export type RegruStatus = {
  configured: boolean;
  connected: boolean;
  dryRun: boolean;
  accountLogin: string | null;
  accountLabel: string | null;
  services: RegruServiceInfo[];
  activeCount: number;
  suspendedCount: number;
  totalCount: number;
  updatedAt: string;
  error?: string;
  hint?: string;
};

export type RegruToggleResult = {
  ok: boolean;
  message: string;
  dryRun: boolean;
};

type RegruApiService = {
  service_id: string;
  dname: string;
  servtype: string;
  subtype: string;
  state: string;
  creation_date?: string;
  expiration_date?: string;
};

type RegruApiResponse = {
  result: "success" | "error";
  error_code?: string;
  error_text?: string;
  answer?: {
    services?: RegruApiService[];
  };
};

export class RegruError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "RegruError";
  }
}

async function resolveRegruCredentials(): Promise<{
  username: string | null;
  password: string | null;
  accountLabel: string | null;
}> {
  const fromEnvUser = process.env.REGRU_USERNAME ?? process.env.REG_RU_USERNAME;
  const fromEnvPass = process.env.REGRU_PASSWORD ?? process.env.REG_RU_PASSWORD;

  if (fromEnvUser?.trim() && fromEnvPass) {
    return {
      username: fromEnvUser.trim(),
      password: fromEnvPass,
      accountLabel: null,
    };
  }

  const store = await getCredentialsStore();
  const entry = store?.categories
    .flatMap((c) => c.entries)
    .find((e) => e.id === REGRU_CREDENTIAL_ID);

  if (entry?.username && entry.password) {
    return {
      username: entry.username,
      password: entry.password,
      accountLabel: entry.label ?? "Reg.ru",
    };
  }

  return { username: null, password: null, accountLabel: entry?.label ?? null };
}

export async function getRegruConfig(): Promise<RegruConfig | null> {
  const { username, password, accountLabel } = await resolveRegruCredentials();
  if (!username || !password) return null;

  return {
    username,
    password,
    dryRun: process.env.REGRU_DRY_RUN !== "false",
    accountLabel,
  };
}

async function regruCall(
  method: string,
  params: Record<string, string> = {},
  config: RegruConfig,
): Promise<RegruApiResponse> {
  const body = new URLSearchParams();
  body.set("username", config.username);
  body.set("password", config.password);
  body.set("output_content_type", "plain");

  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }

  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as RegruApiResponse;

  if (data.result === "error") {
    throw new RegruError(
      data.error_text || data.error_code || "Ошибка Reg.ru API",
      data.error_code,
    );
  }

  return data;
}

function mapState(state: string): RegruServiceInfo["status"] {
  if (state === "A") return "active";
  if (state === "S") return "suspended";
  return "inactive";
}

function mapService(raw: RegruApiService): RegruServiceInfo {
  const kind: RegruServiceKind =
    raw.servtype === "srv_dedicated" ? "dedicated" : "hosting";
  const typeLabel = SERVTYPE_LABELS[raw.servtype] ?? raw.servtype;
  const plan = raw.subtype || "—";
  const domain = raw.dname || "—";

  return {
    serviceId: raw.service_id,
    kind,
    domain,
    plan,
    servtype: raw.servtype,
    typeLabel,
    status: mapState(raw.state),
    expirationDate: raw.expiration_date ?? "",
    label: domain !== "—" ? domain : `${typeLabel} #${raw.service_id}`,
  };
}

export async function listRegruServices(config: RegruConfig): Promise<RegruServiceInfo[]> {
  const data = await regruCall("service/get_list", {}, config);
  return (data.answer?.services ?? [])
    .filter((s) => MANAGED_SERVTYPES.has(s.servtype))
    .map(mapService)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "hosting" ? -1 : 1;
      return a.domain.localeCompare(b.domain, "ru");
    });
}

async function formatIpDeniedHint(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    const { ip } = (await res.json()) as { ip?: string };
    if (ip) {
      return `Добавьте IP ${ip} в Reg.ru → Настройки API → «Диапазоны IP-адресов» → Сохранить. Прямая ссылка: reg.ru/user/account/#/settings/api/`;
    }
  } catch {
    // ignore
  }
  return "Добавьте IP этого сервера в Reg.ru → Настройки API → «Диапазоны IP-адресов». Ссылка: reg.ru/user/account/#/settings/api/";
}

function formatError(error: unknown): string {
  if (error instanceof RegruError) {
    if (error.code === "ACCESS_DENIED_FROM_IP") {
      return "Доступ к API Reg.ru с этого IP запрещён";
    }
    if (error.code === "USER_AUTHENTICATION_FAILED" || error.code === "PASSWORD_AUTH_FAILED") {
      return "Неверный логин или пароль Reg.ru (проверьте credentials или пароль для API в настройках)";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Неизвестная ошибка";
}

export async function getRegruStatus(): Promise<RegruStatus> {
  const { username, password, accountLabel } = await resolveRegruCredentials();
  const updatedAt = new Date().toISOString();

  if (!username || !password) {
    return {
      configured: false,
      connected: false,
      dryRun: process.env.REGRU_DRY_RUN !== "false",
      accountLogin: username,
      accountLabel,
      services: [],
      activeCount: 0,
      suspendedCount: 0,
      totalCount: 0,
      updatedAt,
      error:
        "Добавьте логин/пароль Reg.ru в credentials.json (запись «Рег.ру») или REGRU_USERNAME / REGRU_PASSWORD в .env.local",
    };
  }

  const config = await getRegruConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      dryRun: true,
      accountLogin: username,
      accountLabel,
      services: [],
      activeCount: 0,
      suspendedCount: 0,
      totalCount: 0,
      updatedAt,
      error: "Reg.ru не настроен",
    };
  }

  try {
    const baseServices = await enrichHostingStates(config, await listRegruServices(config));
    const services = await Promise.all(
      baseServices.map(async (service) => {
        if (service.kind !== "hosting") return service;
        const { sites, error, primaryDomain } = await loadHostingSitesForService(
          config,
          service.serviceId,
        );
        return {
          ...service,
          sites,
          panelConnected: sites.length > 0,
          panelError: error,
          label: hostingDisplayLabel(primaryDomain, sites, service.serviceId),
        };
      }),
    );

    const hostingSites = services
      .filter((s) => s.kind === "hosting")
      .flatMap((s) => s.sites ?? []);
    const activeCount = hostingSites.filter((site) => site.enabled).length;
    const suspendedCount = hostingSites.filter((site) => !site.enabled).length;

    return {
      configured: true,
      connected: true,
      dryRun: config.dryRun,
      accountLogin: config.username,
      accountLabel: config.accountLabel,
      services,
      activeCount,
      suspendedCount,
      totalCount: services.length,
      updatedAt,
      hint: config.dryRun
        ? "Dry-run: услуги не приостанавливаются"
        : services.length === 0
          ? "Услуги не найдены — проверьте аккаунт Reg.ru"
          : "Переключатель у каждого домена. Если example.org не грузится — пароль панели в Reg.ru → Хостинг → Доступы → REGRU_HOSTING_PASSWORD_90856995 в .env.local.",
    };
  } catch (error) {
    const message = formatError(error);
    let hint: string | undefined;

    if (error instanceof RegruError && error.code === "ACCESS_DENIED_FROM_IP") {
      hint = await formatIpDeniedHint();
    }

    return {
      configured: true,
      connected: false,
      dryRun: config.dryRun,
      accountLogin: config.username,
      accountLabel: config.accountLabel,
      services: [],
      activeCount: 0,
      suspendedCount: 0,
      totalCount: 0,
      updatedAt,
      error: message,
      hint,
    };
  }
}

async function serviceAction(
  config: RegruConfig,
  serviceId: string,
  action: "suspend" | "resume",
): Promise<void> {
  if (config.dryRun) return;
  await regruCall(`service/${action}`, { service_id: serviceId }, config);
}

async function getServiceStatusById(
  config: RegruConfig,
  serviceId: string,
): Promise<RegruServiceInfo["status"] | null> {
  const data = await regruCall("service/get_info", { service_id: serviceId }, config);
  const raw = data.answer?.services?.[0];
  if (!raw?.state) return null;
  return mapState(raw.state);
}

async function waitForServiceStatus(
  config: RegruConfig,
  serviceId: string,
  expected: RegruServiceInfo["status"],
  timeoutMs = 25_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const actual = await getServiceStatusById(config, serviceId);
    if (actual === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function enrichHostingStates(
  config: RegruConfig,
  services: RegruServiceInfo[],
): Promise<RegruServiceInfo[]> {
  return Promise.all(
    services.map(async (service) => {
      if (service.kind !== "hosting") return service;
      try {
        const fresh = await getServiceStatusById(config, service.serviceId);
        return fresh && fresh !== service.status ? { ...service, status: fresh } : service;
      } catch {
        return service;
      }
    }),
  );
}

async function serviceActionWithRetry(
  config: RegruConfig,
  serviceId: string,
  action: "suspend" | "resume",
): Promise<void> {
  try {
    await serviceAction(config, serviceId, action);
  } catch (error) {
    const expected = action === "suspend" ? "suspended" : "active";
    const actual = await getServiceStatusById(config, serviceId);
    if (actual === expected) return;

    if (error instanceof RegruError) {
      if (error.code === "SERVICE_NOT_SUSPENDED" && action === "resume" && actual === "active") {
        return;
      }
      if (error.code === "SERVICE_NOT_ACTIVE" && action === "suspend" && actual === "suspended") {
        return;
      }
    }

    const message = formatError(error);
    const retriable =
      message.includes("not active") ||
      message.includes("not suspended") ||
      message.includes("INCORRECT_STATE");

    if (!retriable) throw error;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await serviceAction(config, serviceId, action);
  }
}

const SLOW_STATUS_HINT =
  "Reg.ru ещё применяет изменение — подождите до 30 с и нажмите «Обновить», если статус не обновился.";

export async function toggleRegruHostingSite(
  serviceId: string,
  domain: string,
  action: "on" | "off",
): Promise<RegruToggleResult> {
  const config = await getRegruConfig();
  if (!config) {
    return { ok: false, message: "Reg.ru не настроен", dryRun: true };
  }

  if (config.dryRun) {
    return {
      ok: true,
      message: `[Dry-run] ${action === "off" ? "Выключить" : "Включить"} ${domain}`,
      dryRun: true,
    };
  }

  try {
    const panel = await getHostingPanel(config, serviceId);
    if (!panel) {
      return { ok: false, message: "Панель хостинга не найдена", dryRun: false };
    }

    await toggleHostingSite(panel, domain, action);
    const sites = await listHostingSites(panel);
    const site = sites.find((item) => item.domain === domain);
    const expected = action === "on";
    if (site && site.enabled === expected) {
      return {
        ok: true,
        message: action === "off" ? `${domain} отключён` : `${domain} включён`,
        dryRun: false,
      };
    }

    return {
      ok: false,
      message: "Команда отправлена, но статус сайта не изменился",
      dryRun: false,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Ошибка ISPmanager",
      dryRun: config.dryRun,
    };
  }
}

export async function toggleRegruService(
  serviceId: string,
  action: "suspend" | "resume",
): Promise<RegruToggleResult> {
  const config = await getRegruConfig();

  if (!config) {
    return { ok: false, message: "Reg.ru не настроен", dryRun: true };
  }

  try {
    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] ${action === "suspend" ? "Приостановка" : "Возобновление"} услуги #${serviceId}`,
        dryRun: true,
      };
    }

    const before = await getServiceStatusById(config, serviceId);
    const expected = action === "suspend" ? "suspended" : "active";
    if (before === expected) {
      return {
        ok: true,
        message:
          expected === "active"
            ? "Хостинг уже включён (сайты работают)"
            : "Хостинг уже приостановлен (сайты отключены)",
        dryRun: false,
      };
    }

    await serviceActionWithRetry(config, serviceId, action);

    const changed = await waitForServiceStatus(config, serviceId, expected);
    if (!changed) {
      const actual = await getServiceStatusById(config, serviceId);
      if (actual === expected) {
        return {
          ok: true,
          message: action === "suspend" ? "Хостинг приостановлен" : "Хостинг включён",
          dryRun: false,
        };
      }
      return {
        ok: false,
        message: SLOW_STATUS_HINT,
        dryRun: false,
      };
    }

    return {
      ok: true,
      message:
        action === "suspend"
          ? "Хостинг приостановлен — сайты отключены"
          : "Хостинг включён — сайты работают",
      dryRun: false,
    };
  } catch (error) {
    const message = formatError(error);
    return { ok: false, message, dryRun: config.dryRun };
  }
}

export async function toggleAllRegru(action: "off" | "on"): Promise<RegruToggleResult> {
  const config = await getRegruConfig();

  if (!config) {
    return { ok: false, message: "Reg.ru не настроен", dryRun: true };
  }

  try {
    const services = await listRegruServices(config);
    const targets =
      action === "off"
        ? services.filter((s) => s.status === "active")
        : services.filter((s) => s.status === "suspended");

    if (targets.length === 0) {
      return {
        ok: true,
        message:
          action === "off"
            ? "Нет активных услуг для приостановки"
            : "Нет приостановленных услуг для возобновления",
        dryRun: config.dryRun,
      };
    }

    if (config.dryRun) {
      return {
        ok: true,
        message: `[Dry-run] Было бы ${action === "off" ? "приостановлено" : "возобновлено"} ${targets.length} услуг`,
        dryRun: true,
      };
    }

    const apiAction = action === "off" ? "suspend" : "resume";
    let done = 0;
    const failed: string[] = [];

    for (const service of targets) {
      try {
        await serviceActionWithRetry(config, service.serviceId, apiAction);
        const expected = apiAction === "suspend" ? "suspended" : "active";
        const changed = await waitForServiceStatus(config, service.serviceId, expected, 15_000);
        if (changed) done += 1;
        else {
          const actual = await getServiceStatusById(config, service.serviceId);
          if (actual === expected) done += 1;
          else failed.push(service.label);
        }
      } catch {
        failed.push(service.label);
      }
    }

    const failedNote =
      failed.length > 0
        ? ` Не удалось: ${failed.join(", ")}.${failed.length === targets.length ? ` ${SLOW_STATUS_HINT}` : ""}`
        : "";

    return {
      ok: failed.length === 0,
      message: `${action === "off" ? "Приостановлено" : "Возобновлено"}: ${done}.${failedNote}`,
      dryRun: false,
    };
  } catch (error) {
    return { ok: false, message: formatError(error), dryRun: config.dryRun };
  }
}
