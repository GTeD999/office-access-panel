import { lookup } from "dns/promises";
import { getMikrotikConfig, MGMT_WHITELIST_LIST } from "./config";
import { getAddressList, upsertAddressListEntry } from "./mikrotik";

export const PANEL_WHITELIST_COMMENT =
  process.env.PANEL_WHITELIST_COMMENT ??
  process.env.VMWARE_NAT_WHITELIST_COMMENT ??
  "novactiv-access-panel";

const PANEL_ADDRESS_LIST =
  process.env.PANEL_ADDRESS_LIST ??
  process.env.VMWARE_NAT_ADDRESS_LIST ??
  MGMT_WHITELIST_LIST;

/** Срок жизни IP в whitelist — старые сами исчезают, новый добавляется без блокировки. */
const PANEL_WHITELIST_TIMEOUT =
  process.env.PANEL_WHITELIST_TIMEOUT?.trim() || "3d";

export type PanelWhitelistSyncResult = {
  ip: string | null;
  ips: string[];
  synced: boolean;
  added: number;
  updated: number;
  error?: string;
};

function parseHostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPublicIpv4(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  if (ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("192.168.")) {
    return false;
  }
  const second = Number(ip.split(".")[1]);
  if (ip.startsWith("172.") && second >= 16 && second <= 31) return false;
  return true;
}

/** IP браузера (за nginx/cloudflare). */
export function resolveClientPublicIp(request: Request): string | null {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  ];

  for (const candidate of candidates) {
    if (candidate && isPublicIpv4(candidate)) return candidate;
  }
  return null;
}

/** Текущий исходящий публичный IP сервера панели (или значение из env). */
export async function resolveOutboundPublicIp(): Promise<string | null> {
  const fromEnv =
    process.env.PANEL_OUTBOUND_IP?.trim() ||
    process.env.VMWARE_WHITELIST_IP?.trim();
  if (fromEnv) return fromEnv;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { ip?: string };
    const ip = data.ip?.trim() || null;
    return ip && isPublicIpv4(ip) ? ip : null;
  } catch {
    return null;
  }
}

async function resolveDdnsIps(): Promise<string[]> {
  const hosts = parseHostList(process.env.PANEL_DDNS_HOSTNAME);
  const ips: string[] = [];

  for (const host of hosts) {
    try {
      const result = await lookup(host, { family: 4 });
      const address = typeof result === "string" ? result : result.address;
      if (address && isPublicIpv4(address)) ips.push(address);
    } catch {
      // DDNS ещё не обновился или хост недоступен
    }
  }

  return ips;
}

function panelAutoWhitelistEnabled(): boolean {
  return process.env.PANEL_AUTO_WHITELIST !== "false";
}

async function collectWhitelistIps(clientIp?: string | null): Promise<string[]> {
  const ips = new Set<string>();

  const outbound = await resolveOutboundPublicIp();
  if (outbound) ips.add(outbound);

  if (clientIp && isPublicIpv4(clientIp)) ips.add(clientIp);

  for (const ip of await resolveDdnsIps()) ips.add(ip);

  for (const ip of parseHostList(process.env.MIKROTIK_MGMT_EXTRA_IPS)) {
    if (isPublicIpv4(ip)) ips.add(ip);
  }

  return [...ips];
}

/**
 * Обновляет whitelist MikroTik:
 * — добавляет все актуальные IP (сервер, браузер, DDNS);
 * — старые не удаляются сразу, истекают по timeout (по умолчанию 3 дня).
 */
export async function syncPanelWhitelist(options?: {
  clientIp?: string | null;
}): Promise<PanelWhitelistSyncResult> {
  const ips = await collectWhitelistIps(options?.clientIp);

  if (!panelAutoWhitelistEnabled()) {
    return {
      ip: ips[0] ?? null,
      ips,
      synced: false,
      added: 0,
      updated: 0,
    };
  }

  const mikrotik = getMikrotikConfig();
  if (!mikrotik?.allowWrite) {
    return {
      ip: ips[0] ?? null,
      ips,
      synced: false,
      added: 0,
      updated: 0,
      error: "MikroTik write disabled (MIKROTIK_ALLOW_WRITE)",
    };
  }

  if (ips.length === 0) {
    return {
      ip: null,
      ips: [],
      synced: false,
      added: 0,
      updated: 0,
      error: "Не удалось определить публичный IP",
    };
  }

  try {
    let added = 0;
    let updated = 0;

    for (const ip of ips) {
      const result = await upsertAddressListEntry(
        mikrotik,
        PANEL_ADDRESS_LIST,
        ip,
        PANEL_WHITELIST_COMMENT,
        PANEL_WHITELIST_TIMEOUT,
        mikrotik.dryRun,
      );
      if (result.added) added++;
      if (result.updated) updated++;
    }

    await pruneExcessPanelEntries(mikrotik, mikrotik.dryRun).catch(() => undefined);

    return {
      ip: ips[0],
      ips,
      synced: true,
      added,
      updated,
    };
  } catch (error) {
    return {
      ip: ips[0] ?? null,
      ips,
      synced: false,
      added: 0,
      updated: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pruneExcessPanelEntries(
  config: NonNullable<ReturnType<typeof getMikrotikConfig>>,
  dryRun: boolean,
): Promise<void> {
  const maxRaw = process.env.PANEL_WHITELIST_MAX_IPS?.trim();
  if (!maxRaw) return;

  const max = Number(maxRaw);
  if (!Number.isFinite(max) || max < 1) return;

  const entries = await getAddressList(config);
  const panelEntries = entries.filter(
    (entry) =>
      entry.list === PANEL_ADDRESS_LIST &&
      entry.comment === PANEL_WHITELIST_COMMENT &&
      entry.address,
  );

  if (panelEntries.length <= max) return;
  if (dryRun) return;

  const toRemove = panelEntries.slice(0, panelEntries.length - max);
  for (const entry of toRemove) {
    if (!entry[".id"]) continue;
    const url = `${config.host}/rest/ip/firewall/address-list/${encodeURIComponent(entry[".id"])}`;
    const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    await fetch(url, {
      method: "DELETE",
      headers: { Authorization: auth },
      cache: "no-store",
    });
  }
}
