import type { RegruConfig } from "./regru";

const REGRU_API_BASE = "https://api.reg.ru/api/regru2";

export type HostingSiteInfo = {
  domain: string;
  enabled: boolean;
};

export type HostingPanel = {
  serviceId: string;
  host: string;
  login: string;
  password: string;
  primaryDomain: string;
};

type IspmgrElem = Record<string, { $?: string } | undefined>;

type IspmgrDoc = {
  doc?: {
    elem?: IspmgrElem[];
    error?: {
      $object?: string;
      msg?: { $?: string };
      detail?: { $?: string };
    };
  };
};

type HostingDetails = {
  login?: string;
  passwd?: string;
  server_hostname?: string;
  adddomains?: string;
};

function resolvePanelPassword(serviceId: string, fromApi: string): string {
  const byId = process.env[`REGRU_HOSTING_PASSWORD_${serviceId}`];
  if (byId?.trim()) return byId.trim();
  const shared = process.env.REGRU_HOSTING_PANEL_PASSWORD;
  if (shared?.trim()) return shared.trim();
  return fromApi;
}

async function regRuGetDetails(
  config: RegruConfig,
  serviceId: string,
): Promise<{ details?: HostingDetails } | undefined> {
  const body = new URLSearchParams();
  body.set("username", config.username);
  body.set("password", config.password);
  body.set("output_content_type", "plain");
  body.set("service_id", serviceId);

  const response = await fetch(`${REGRU_API_BASE}/service/get_details`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    result?: string;
    error_text?: string;
    answer?: { services?: Array<{ details?: HostingDetails }> };
  };

  if (data.result === "error") {
    throw new Error(data.error_text || "Ошибка Reg.ru API");
  }

  return data.answer?.services?.[0];
}

export async function getHostingPanel(
  config: RegruConfig,
  serviceId: string,
): Promise<HostingPanel | null> {
  const svc = await regRuGetDetails(config, serviceId);
  const details = svc?.details;
  if (!details?.server_hostname || !details.login || !details.passwd) return null;

  return {
    serviceId,
    host: details.server_hostname,
    login: details.login,
    password: resolvePanelPassword(serviceId, details.passwd),
    primaryDomain: details.adddomains?.trim() || `Хостинг #${serviceId}`,
  };
}

async function ispmgrCall(
  panel: HostingPanel,
  func: string,
  params: Record<string, string> = {},
): Promise<IspmgrDoc> {
  const query = new URLSearchParams({
    authinfo: `${panel.login}:${panel.password}`,
    func,
    out: "json",
    ...params,
  });

  const bases = [
    `https://${panel.host}/ispmgr`,
    `https://${panel.host}:1500/ispmgr`,
  ];

  let lastError = "Не удалось подключиться к ISPmanager";

  for (const base of bases) {
    try {
      const response = await fetch(`${base}?${query.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await response.json()) as IspmgrDoc;
      const err = data.doc?.error;
      if (err) {
        const code = err.$object ?? "";
        const message = err.detail?.$ || err.msg?.$ || code;
        if (code === "badpassword") {
          lastError =
            "Неверный пароль панели — сбросьте в Reg.ru → Хостинг → Доступы или задайте REGRU_HOSTING_PASSWORD_" +
            panel.serviceId +
            " в .env.local";
          continue;
        }
        if (code === "blocklogon") {
          throw new Error(
            "Слишком много попыток входа в ISPmanager — подождите 1–2 минуты и нажмите «Обновить»",
          );
        }
        throw new Error(message || "Ошибка ISPmanager");
      }
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
}

function parseSites(data: IspmgrDoc): HostingSiteInfo[] {
  const elems = data.doc?.elem ?? [];
  return elems
    .map((row) => {
      const domain = row.name?.$?.trim();
      if (!domain) return null;
      return {
        domain,
        enabled: row.active?.$ === "on",
      };
    })
    .filter((site): site is HostingSiteInfo => site !== null)
    .sort((a, b) => a.domain.localeCompare(b.domain, "ru"));
}

export async function listHostingSites(panel: HostingPanel): Promise<HostingSiteInfo[]> {
  const data = await ispmgrCall(panel, "webdomain");
  return parseSites(data);
}

export async function toggleHostingSite(
  panel: HostingPanel,
  domain: string,
  action: "on" | "off",
): Promise<void> {
  const func = action === "off" ? "webdomain.suspend" : "webdomain.resume";
  await ispmgrCall(panel, func, { elid: domain });
}

export async function loadHostingSitesForService(
  config: RegruConfig,
  serviceId: string,
): Promise<{
  sites: HostingSiteInfo[];
  panel: HostingPanel | null;
  primaryDomain: string;
  error?: string;
}> {
  try {
    const panel = await getHostingPanel(config, serviceId);
    if (!panel) {
      return {
        sites: [],
        panel: null,
        primaryDomain: `Хостинг #${serviceId}`,
        error: "Нет данных панели хостинга",
      };
    }
    const sites = await listHostingSites(panel);
    return { sites, panel, primaryDomain: panel.primaryDomain };
  } catch (error) {
    const panel = await getHostingPanel(config, serviceId).catch(() => null);
    return {
      sites: [],
      panel,
      primaryDomain: panel?.primaryDomain ?? `Хостинг #${serviceId}`,
      error: error instanceof Error ? error.message : "Ошибка ISPmanager",
    };
  }
}

function hostingDisplayLabel(
  primaryDomain: string,
  sites: HostingSiteInfo[],
  serviceId: string,
): string {
  if (primaryDomain && !primaryDomain.startsWith("Хостинг #")) {
    return primaryDomain;
  }
  const root =
    sites.find((s) => s.domain === "example.com" || s.domain === "example.org") ??
    sites.find((s) => s.domain.split(".").length === 2 && s.domain.includes("novactiv"));
  if (root) {
    return sites.length > 1 ? `${root.domain} (+${sites.length - 1} сайт.)` : root.domain;
  }
  if (sites[0]) {
    return sites.length > 1 ? `${sites[0].domain} (+${sites.length - 1})` : sites[0].domain;
  }
  return `Хостинг #${serviceId}`;
}

export { hostingDisplayLabel };
