import { MGMT_WHITELIST_LIST } from "./config";
import type { MikrotikConfig } from "./mikrotik";

export const DDNS_SYNC_SCRIPT_NAME = "novactiv-ddns-whitelist";
export const DDNS_SYNC_SCHEDULER_NAME = "novactiv-ddns-whitelist";
export const DDNS_WHITELIST_COMMENT = "novactiv-ddns";

function parseDdnsHosts(): string[] {
  const raw = process.env.PANEL_DDNS_HOSTNAME?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

function buildRouterScript(hostname: string, timeout: string): string {
  return `
:local hostname "${hostname}"
:local ip [:resolve $hostname]
:if ([:len $ip] > 0) do={
  :local found [/ip firewall address-list find list=${MGMT_WHITELIST_LIST} address=$ip]
  :if ([:len $found] = 0) do={
    /ip firewall address-list add list=${MGMT_WHITELIST_LIST} address=$ip timeout=${timeout} comment=${DDNS_WHITELIST_COMMENT}
  } else={
    /ip firewall address-list set $found timeout=${timeout}
  }
}
`.trim();
}

type ScriptRow = { ".id"?: string; name?: string; source?: string };
type SchedulerRow = { ".id"?: string; name?: string; disabled?: string };

async function mikrotikRest<T>(
  config: MikrotikConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const response = await fetch(`${config.host}/rest${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `MikroTik ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/**
 * Скрипт на самом роутере: раз в 5 минут резолвит DDNS и кладёт IP в 0_WL.
 * Работает даже когда панель недоступна с нового IP.
 */
export async function ensureRouterDdnsWhitelistSync(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ updated: boolean; dryRun: boolean }> {
  const hosts = parseDdnsHosts();
  if (hosts.length === 0) return { updated: false, dryRun };

  const timeout = process.env.PANEL_WHITELIST_TIMEOUT?.trim() || "3d";
  const source = hosts.map((host) => buildRouterScript(host, timeout)).join("\n");

  if (dryRun) return { updated: true, dryRun: true };

  const scripts = await mikrotikRest<ScriptRow[]>(config, "/system/script");
  const existing = scripts.find((row) => row.name === DDNS_SYNC_SCRIPT_NAME);

  if (existing?.[".id"]) {
    await mikrotikRest(config, `/system/script/${encodeURIComponent(existing[".id"])}`, {
      method: "PATCH",
      body: JSON.stringify({ source }),
    });
  } else {
    await mikrotikRest(config, "/system/script/add", {
      method: "POST",
      body: JSON.stringify({
        name: DDNS_SYNC_SCRIPT_NAME,
        source,
        policy: "read,write,policy,test",
      }),
    });
  }

  const schedulers = await mikrotikRest<SchedulerRow[]>(config, "/system/scheduler");
  const scheduler = schedulers.find((row) => row.name === DDNS_SYNC_SCHEDULER_NAME);

  if (scheduler?.[".id"]) {
    await mikrotikRest(
      config,
      `/system/scheduler/${encodeURIComponent(scheduler[".id"])}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          interval: "5m",
          "on-event": DDNS_SYNC_SCRIPT_NAME,
          disabled: "false",
        }),
      },
    );
  } else {
    await mikrotikRest(config, "/system/scheduler/add", {
      method: "POST",
      body: JSON.stringify({
        name: DDNS_SYNC_SCHEDULER_NAME,
        interval: "5m",
        "on-event": DDNS_SYNC_SCRIPT_NAME,
        disabled: "false",
        comment: "novactiv:ddns-whitelist",
      }),
    });
  }

  await mikrotikRest(config, "/system/script/run", {
    method: "POST",
    body: JSON.stringify({ number: DDNS_SYNC_SCRIPT_NAME }),
  });

  return { updated: true, dryRun: false };
}
