export const INTERNET_OFF_RULE_COMMENT = "office:internet-off";
export const LOCKED_NAT_MARKER = "office:locked";

function parseIpList(raw: string | undefined, fallback: string): string[] {
  const value = raw?.trim() ? raw : fallback;
  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/** IP камер — пробросы и исходящий интернет не отключаются при «Отключить интернет» */
export const CAMERA_IPS = parseIpList(
  process.env.MIKROTIK_CAMERA_IPS,
  "192.168.1.7,192.168.1.8,192.168.1.9",
);

/** NAT-пробросы на эти IP не блокируются (камеры + гипервизор для панели) */
export const NAT_KEEP_IPS = parseIpList(
  process.env.MIKROTIK_NAT_KEEP_IPS,
  [...CAMERA_IPS, "192.168.1.20"].join(","),
);

/** Исходящий интернет остаётся для этих IP (камеры в облаке + гипервизор) */
export const INTERNET_EXEMPT_IPS = parseIpList(
  process.env.MIKROTIK_INTERNET_EXEMPT_IPS,
  [...CAMERA_IPS, "192.168.1.20"].join(","),
);

export const INTERNET_EXEMPT_RULE_COMMENT = "office:internet-exempt";

export function getCameraIps(): Set<string> {
  return new Set(CAMERA_IPS);
}

export function getNatKeepIps(): Set<string> {
  return new Set(NAT_KEEP_IPS);
}

export function getInternetExemptIps(): string[] {
  return INTERNET_EXEMPT_IPS;
}

/** Подсеть офиса — блокируется весь трафик за её пределы */
export const OFFICE_LAN_CIDR =
  process.env.MIKROTIK_OFFICE_LAN ?? "192.168.1.0/24";

/** Address-list с вашими IP для доступа к роутеру (переживает reboot). */
export const MGMT_WHITELIST_LIST =
  process.env.MIKROTIK_MGMT_WHITELIST_LIST ?? "0_WL";

/** Address-list с CIDR целых стран (например VN — Вьетнам). */
export const MGMT_GEO_LIST =
  process.env.MIKROTIK_MGMT_GEO_LIST ?? "GEO_MGMT";

/** ISO-коды стран, с которых разрешён доступ к роутеру: VN, RU, ... */
export function getMgmtAllowCountries(): string[] {
  const raw = process.env.MIKROTIK_MGMT_ALLOW_COUNTRIES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
}

export function getOfficeLanPrefix(): string {
  return OFFICE_LAN_CIDR.split("/")[0]?.replace(/\.\d+$/, "") ?? "192.168.1";
}

export function isOfficeLanIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const prefix = getOfficeLanPrefix();
  return ip.startsWith(`${prefix}.`);
}

export function getMikrotikConfig() {
  const host = process.env.MIKROTIK_HOST;
  const username = process.env.MIKROTIK_USERNAME;
  const password = process.env.MIKROTIK_PASSWORD;

  if (!host || !username || !password) {
    return null;
  }

  return {
    host: host.replace(/\/$/, ""),
    username,
    password,
    allowWrite: process.env.MIKROTIK_ALLOW_WRITE === "true",
    dryRun: process.env.MIKROTIK_DRY_RUN !== "false",
  };
}

export function getAppPin(): string | null {
  return process.env.APP_PIN ?? null;
}
