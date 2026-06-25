import {
  getCameraIps,
  getInternetExemptIps,
  getNatKeepIps,
  INTERNET_EXEMPT_RULE_COMMENT,
  INTERNET_OFF_RULE_COMMENT,
  isOfficeLanIp,
  LOCKED_NAT_MARKER,
  OFFICE_LAN_CIDR,
} from "./config";

type MikrotikConfig = {
  host: string;
  username: string;
  password: string;
};

export type { MikrotikConfig };

export type MikrotikResource = {
  version: string;
  "board-name": string;
  uptime: string;
  "cpu-load": string;
  "free-memory": string;
  "total-memory": string;
};

export type NatRule = {
  ".id": string;
  comment?: string;
  action?: string;
  disabled?: string;
  "to-addresses"?: string;
  "dst-port"?: string;
};

export type AddressListEntry = {
  ".id": string;
  list?: string;
  address?: string;
  comment?: string;
};

export type FirewallFilterRule = {
  ".id": string;
  comment?: string;
  chain?: string;
  action?: string;
  disabled?: string;
  "src-address"?: string;
  "dst-address"?: string;
  "in-interface-list"?: string;
  "out-interface-list"?: string;
};

export class MikrotikError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "MikrotikError";
  }
}

function authHeader(config: MikrotikConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
}

async function mikrotikFetch<T>(
  config: MikrotikConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${config.host}/rest${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { detail?: string; message?: string };
      if (parsed.detail?.includes("not enough permissions")) {
        detail =
          "Недостаточно прав у пользователя API. Нужна группа full или write.";
      } else if (parsed.message) {
        detail = parsed.message;
      }
    } catch {
      // keep raw body
    }
    throw new MikrotikError(
      detail || `MikroTik API error: ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getSystemResource(
  config: MikrotikConfig,
): Promise<MikrotikResource> {
  return mikrotikFetch<MikrotikResource>(config, "/system/resource");
}

export async function getFirewallRules(
  config: MikrotikConfig,
): Promise<FirewallFilterRule[]> {
  return mikrotikFetch<FirewallFilterRule[]>(config, "/ip/firewall/filter");
}

export function findInternetOffRule(
  rules: FirewallFilterRule[],
): FirewallFilterRule | undefined {
  const matches = rules.filter((rule) => rule.comment === INTERNET_OFF_RULE_COMMENT);
  return matches.find((r) => r.disabled !== "true") ?? matches[0];
}

export function findAllInternetOffRules(
  rules: FirewallFilterRule[],
): FirewallFilterRule[] {
  return rules.filter((rule) =>
    (rule.comment ?? "").startsWith(INTERNET_OFF_RULE_COMMENT),
  );
}

function getForwardRules(rules: FirewallFilterRule[]): FirewallFilterRule[] {
  return rules.filter((r) => r.chain === "forward");
}

function findEstablishedRuleId(rules: FirewallFilterRule[]): string | undefined {
  return getForwardRules(rules).find((r) =>
    r.comment?.includes("accept established,related"),
  )?.[".id"];
}

function internetOffRuleBody(): Record<string, string> {
  return {
    chain: "forward",
    action: "drop",
    "src-address": OFFICE_LAN_CIDR,
    "dst-address": `!${OFFICE_LAN_CIDR}`,
    comment: INTERNET_OFF_RULE_COMMENT,
  };
}

export async function ensureInternetOffRuleShape(
  config: MikrotikConfig,
  ruleId: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;

  await mikrotikFetch(config, `/ip/firewall/filter/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: JSON.stringify(internetOffRuleBody()),
  });

  await ensureForwardBlockOrder(config, false);
}

async function moveFilterRule(
  config: MikrotikConfig,
  ruleId: string,
  destinationId: string,
): Promise<void> {
  await mikrotikFetch(config, "/ip/firewall/filter/move", {
    method: "POST",
    body: JSON.stringify({ numbers: ruleId, destination: destinationId }),
  });
}

/**
 * Порядок forward: established → exempt (камеры, гипервизор) → drop офиса.
 * Иначе ответы гипервизора на входящий NAT :8822 режутся до established.
 */
export async function ensureForwardBlockOrder(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  if (dryRun) return { updated: 0, dryRun: true };

  let updated = 0;
  let rules = await getFirewallRules(config);
  const activeFwd = () =>
    getForwardRules(rules).filter((r) => r.disabled !== "true");

  const refresh = async () => {
    rules = await getFirewallRules(config);
  };

  const establishedId = findEstablishedRuleId(rules);
  const dropRule = findInternetOffRule(rules);
  if (!dropRule) return { updated: 0, dryRun: false };

  const exemptActive = () =>
    findInternetExemptRules(rules).filter((r) => r.disabled !== "true");

  if (establishedId) {
    const fwd = activeFwd();
    const estIdx = fwd.findIndex((r) => r[".id"] === establishedId);
    const firstTarget = exemptActive()[0]?.[".id"] ?? dropRule[".id"];
    const targetIdx = fwd.findIndex((r) => r[".id"] === firstTarget);
    if (estIdx > targetIdx) {
      await moveFilterRule(config, establishedId, firstTarget);
      updated++;
      await refresh();
    }
  }

  for (const exempt of exemptActive()) {
    const fwd = activeFwd();
    const exIdx = fwd.findIndex((r) => r[".id"] === exempt[".id"]);
    const dropIdx = fwd.findIndex((r) => r[".id"] === dropRule[".id"]);
    if (exIdx > dropIdx) {
      await moveFilterRule(config, exempt[".id"], dropRule[".id"]);
      updated++;
      await refresh();
    }
  }

  const fwd = activeFwd();
  const dropIdx = fwd.findIndex((r) => r[".id"] === dropRule[".id"]);
  const exempts = exemptActive();
  const lastExempt = exempts[exempts.length - 1];
  if (lastExempt) {
    const lastExIdx = fwd.findIndex((r) => r[".id"] === lastExempt[".id"]);
    if (dropIdx < lastExIdx) {
      const afterExempt = fwd[lastExIdx + 1];
      if (afterExempt) {
        await moveFilterRule(config, dropRule[".id"], afterExempt[".id"]);
        updated++;
      }
    }
  }

  return { updated, dryRun: false };
}

export async function createInternetOffRule(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ created: boolean; dryRun: boolean }> {
  if (dryRun) {
    return { created: false, dryRun: true };
  }

  const rules = await getFirewallRules(config);
  const establishedId = findEstablishedRuleId(rules);

  await mikrotikFetch(config, "/ip/firewall/filter/add", {
    method: "POST",
    body: JSON.stringify({
      ...internetOffRuleBody(),
      disabled: "true",
      ...(establishedId ? { "place-before": establishedId } : {}),
    }),
  });

  return { created: true, dryRun: false };
}

export async function verifyRouterReachable(config: MikrotikConfig): Promise<boolean> {
  try {
    await getSystemResource(config);
    return true;
  } catch {
    return false;
  }
}

export async function setInternetOffRuleEnabled(
  config: MikrotikConfig,
  ruleId: string,
  blockInternet: boolean,
  dryRun: boolean,
): Promise<{ updated: boolean; dryRun: boolean }> {
  if (dryRun) {
    return { updated: false, dryRun: true };
  }

  await ensureInternetOffRuleShape(config, ruleId, false);

  await mikrotikFetch(config, `/ip/firewall/filter/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      disabled: blockInternet ? "false" : "true",
    }),
  });

  return { updated: true, dryRun: false };
}

export async function getNatRules(config: MikrotikConfig): Promise<NatRule[]> {
  return mikrotikFetch<NatRule[]>(config, "/ip/firewall/nat");
}

export async function getAddressList(
  config: MikrotikConfig,
): Promise<AddressListEntry[]> {
  return mikrotikFetch<AddressListEntry[]>(config, "/ip/firewall/address-list");
}

/** Добавляет IP в address-list, если записи ещё нет (RouterOS REST: PUT). */
export async function ensureAddressListEntry(
  config: MikrotikConfig,
  list: string,
  address: string,
  comment: string,
  dryRun: boolean,
): Promise<{ added: boolean; alreadyExists: boolean }> {
  const result = await upsertAddressListEntry(
    config,
    list,
    address,
    comment,
    undefined,
    dryRun,
  );
  return { added: result.added, alreadyExists: result.updated && !result.added };
}

/** Добавляет или обновляет IP (timeout продлевается при повторном вызове). */
export async function upsertAddressListEntry(
  config: MikrotikConfig,
  list: string,
  address: string,
  comment: string,
  timeout: string | undefined,
  dryRun: boolean,
): Promise<{ added: boolean; updated: boolean }> {
  const entries = await getAddressList(config);
  const existing = entries.find((e) => e.list === list && e.address === address);

  if (existing?.[".id"]) {
    if (dryRun) return { added: false, updated: false };
    await mikrotikFetch(
      config,
      `/ip/firewall/address-list/${encodeURIComponent(existing[".id"])}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          comment,
          ...(timeout ? { timeout } : {}),
        }),
      },
    );
    return { added: false, updated: true };
  }

  if (dryRun) return { added: false, updated: false };

  await mikrotikFetch(config, "/ip/firewall/address-list", {
    method: "PUT",
    body: JSON.stringify({
      list,
      address,
      comment,
      ...(timeout ? { timeout } : {}),
    }),
  });

  return { added: true, updated: false };
}

export async function removeAddressListEntry(
  config: MikrotikConfig,
  id: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await mikrotikFetch(config, `/ip/firewall/address-list/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function findOfficeNatRules(rules: NatRule[]): NatRule[] {
  return rules.filter(
    (rule) => rule.action === "dst-nat" && isOfficeLanIp(rule["to-addresses"]),
  );
}

const CAMERA_PORT_HINTS = ["554", "8554", "10554", "37777", "8000", "8001", "8002", "8010", "8011", "8012"];

export function isCameraNatRule(rule: NatRule): boolean {
  const toAddress = rule["to-addresses"];
  if (toAddress && getCameraIps().has(toAddress)) return true;

  const comment = (rule.comment ?? "").toLowerCase();
  if (/cam|camera|камер|nvr|dvr|video|reg_\d/i.test(comment)) return true;

  const port = rule["dst-port"] ?? "";
  if (isOfficeLanIp(toAddress) && CAMERA_PORT_HINTS.some((hint) => port.includes(hint))) {
    return true;
  }

  return false;
}

export function isProtectedNatRule(rule: NatRule): boolean {
  const toAddress = rule["to-addresses"];
  if (toAddress && getNatKeepIps().has(toAddress)) return true;
  if (isCameraNatRule(rule)) return true;
  const port = rule["dst-port"] ?? "";
  if (port.includes("8822")) return true;
  return false;
}

export function findCameraNatRules(rules: NatRule[]): NatRule[] {
  return findOfficeNatRules(rules).filter(isCameraNatRule);
}

export function findProtectedNatRules(rules: NatRule[]): NatRule[] {
  return findOfficeNatRules(rules).filter(isProtectedNatRule);
}

export function findLockableOfficeNatRules(rules: NatRule[]): NatRule[] {
  return findOfficeNatRules(rules).filter((rule) => !isProtectedNatRule(rule));
}

function internetExemptRuleBody(ip: string): Record<string, string> {
  return {
    chain: "forward",
    action: "accept",
    "src-address": ip,
    "dst-address": `!${OFFICE_LAN_CIDR}`,
    comment: `${INTERNET_EXEMPT_RULE_COMMENT}:${ip}`,
  };
}

export function findInternetExemptRules(
  rules: FirewallFilterRule[],
): FirewallFilterRule[] {
  return rules.filter((rule) =>
    (rule.comment ?? "").startsWith(INTERNET_EXEMPT_RULE_COMMENT),
  );
}

export async function setInternetExemptRulesEnabled(
  config: MikrotikConfig,
  enabled: boolean,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  const exemptIps = getInternetExemptIps();
  if (dryRun) return { updated: exemptIps.length, dryRun: true };

  let rules = await getFirewallRules(config);
  let dropRule = findInternetOffRule(rules);
  let updated = 0;

  for (const ip of exemptIps) {
    const comment = `${INTERNET_EXEMPT_RULE_COMMENT}:${ip}`;
    let rule = rules.find((r) => r.comment === comment);

    if (!rule) {
      await mikrotikFetch(config, "/ip/firewall/filter/add", {
        method: "POST",
        body: JSON.stringify({
          ...internetExemptRuleBody(ip),
          disabled: enabled ? "false" : "true",
          ...(dropRule ? { "place-before": dropRule[".id"] } : {}),
        }),
      });
      updated++;
      rules = await getFirewallRules(config);
      dropRule = findInternetOffRule(rules);
      continue;
    }

    if ((rule.disabled === "false") === enabled) continue;

    await mikrotikFetch(config, `/ip/firewall/filter/${encodeURIComponent(rule[".id"])}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: enabled ? "false" : "true" }),
    });
    updated++;

    if (enabled && dropRule) {
      await mikrotikFetch(config, "/ip/firewall/filter/move", {
        method: "POST",
        body: JSON.stringify({
          numbers: rule[".id"],
          destination: dropRule[".id"],
        }),
      });
    }
  }

  return { updated, dryRun: false };
}

function withLockMarker(comment: string | undefined): string {
  const base = (comment ?? "").trim();
  if (base.includes(LOCKED_NAT_MARKER)) return base;
  return base ? `${base} ${LOCKED_NAT_MARKER}` : LOCKED_NAT_MARKER;
}

function withoutLockMarker(comment: string | undefined): string {
  return (comment ?? "")
    .replace(LOCKED_NAT_MARKER, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function patchNatRulesConcurrent(
  config: MikrotikConfig,
  rules: NatRule[],
  bodyForRule: (rule: NatRule) => Record<string, string> | null,
  concurrency = 12,
): Promise<number> {
  const tasks = rules
    .map((rule) => {
      const body = bodyForRule(rule);
      return body ? { id: rule[".id"], body } : null;
    })
    .filter(Boolean) as Array<{ id: string; body: Record<string, string> }>;

  if (tasks.length === 0) return 0;

  let index = 0;
  let updated = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const current = index++;
      const task = tasks[current];
      await mikrotikFetch(
        config,
        `/ip/firewall/nat/${encodeURIComponent(task.id)}`,
        { method: "PATCH", body: JSON.stringify(task.body) },
      );
      updated++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return updated;
}

export async function setOfficeNatLock(
  config: MikrotikConfig,
  lock: boolean,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  const rules = findLockableOfficeNatRules(await getNatRules(config));

  if (dryRun) {
    const count = lock
      ? rules.filter((r) => r.disabled !== "true").length
      : rules.filter((r) => (r.comment ?? "").includes(LOCKED_NAT_MARKER)).length;
    return { updated: count, dryRun: true };
  }

  let updated = 0;

  if (lock) {
    updated = await patchNatRulesConcurrent(config, rules, (rule) => {
      if (isProtectedNatRule(rule)) return null;
      if (rule.disabled === "true") return null;
      return {
        disabled: "true",
        comment: withLockMarker(rule.comment),
      };
    });
    return { updated, dryRun: false };
  }

  const allOffice = findOfficeNatRules(await getNatRules(config));
  updated = await patchNatRulesConcurrent(config, allOffice, (rule) => {
    if (!(rule.comment ?? "").includes(LOCKED_NAT_MARKER)) return null;
    return {
      disabled: "false",
      comment: withoutLockMarker(rule.comment),
    };
  });

  return { updated, dryRun: false };
}

/** Камеры и гипервизор: пробросы + исходящий интернет при блокировке офиса. */
export async function maintainProtectedAccessWhileBlocked(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  const exempt = await setInternetExemptRulesEnabled(config, true, dryRun);
  const order = await ensureForwardBlockOrder(config, dryRun);
  const nat = await restoreProtectedNatRules(config, dryRun);
  return { updated: exempt.updated + order.updated + nat.updated, dryRun };
}

/** Полное восстановление интернета и пробросов после блокировки офиса. */
export async function restoreOfficeInternet(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  if (dryRun) return { updated: 0, dryRun: true };

  let updated = 0;
  const rules = await getFirewallRules(config);

  for (const rule of findAllInternetOffRules(rules)) {
    if (rule.disabled === "true") continue;
    await mikrotikFetch(config, `/ip/firewall/filter/${encodeURIComponent(rule[".id"])}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: "true" }),
    });
    updated++;
  }

  const exempt = await setInternetExemptRulesEnabled(config, false, false);
  const nat = await setOfficeNatLock(config, false, false);
  const protectedNat = await restoreProtectedNatRules(config, false);

  return { updated: updated + exempt.updated + nat.updated + protectedNat.updated, dryRun: false };
}

/** Включает защищённые пробросы (камеры, гипервизор), если их отключили при блокировке. */
export async function restoreProtectedNatRules(
  config: MikrotikConfig,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  const rules = findProtectedNatRules(await getNatRules(config));

  if (dryRun) {
    const count = rules.filter(
      (rule) =>
        rule.disabled === "true" || (rule.comment ?? "").includes(LOCKED_NAT_MARKER),
    ).length;
    return { updated: count, dryRun: true };
  }

  let updated = 0;
  const toRestore = rules.filter(
    (rule) => rule.disabled === "true" || (rule.comment ?? "").includes(LOCKED_NAT_MARKER),
  );

  updated = await patchNatRulesConcurrent(config, toRestore, (rule) => ({
    disabled: "false",
    comment: withoutLockMarker(rule.comment),
  }));

  return { updated, dryRun: false };
}
