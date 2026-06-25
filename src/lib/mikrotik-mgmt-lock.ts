import { getMgmtAllowCountries, MGMT_GEO_LIST, MGMT_WHITELIST_LIST, OFFICE_LAN_CIDR } from "./config";
import {
  ensureAddressListEntry,
  getFirewallRules,
  type FirewallFilterRule,
  type MikrotikConfig,
} from "./mikrotik";

export const MGMT_LOCK_PREFIX = "office:mgmt-lock";
export const MGMT_ALLOW_COMMENT = `${MGMT_LOCK_PREFIX}:allow-wl`;
export const MGMT_ALLOW_GEO_COMMENT = `${MGMT_LOCK_PREFIX}:allow-geo`;
export const MGMT_DROP_LAN_COMMENT = `${MGMT_LOCK_PREFIX}:drop-lan`;
export const MGMT_DROP_REMOTE_COMMENT = `${MGMT_LOCK_PREFIX}:drop-remote`;

const MGMT_TCP_PORTS = "22,80,443,8080,8291,8728,8729";

type MikrotikConfigWithWrite = MikrotikConfig & {
  allowWrite?: boolean;
  dryRun?: boolean;
};

function getInputRules(rules: FirewallFilterRule[]): FirewallFilterRule[] {
  return rules.filter((rule) => rule.chain === "input");
}

function findEstablishedInputId(rules: FirewallFilterRule[]): string | undefined {
  return getInputRules(rules).find(
    (rule) =>
      rule.action === "accept" &&
      (rule.comment?.toLowerCase().includes("established") ||
        rule.comment?.toLowerCase().includes("related")),
  )?.[".id"];
}

export function findMgmtLockRules(rules: FirewallFilterRule[]): FirewallFilterRule[] {
  return rules.filter((rule) =>
    (rule.comment ?? "").startsWith(MGMT_LOCK_PREFIX),
  );
}

export function getMgmtLockStatus(rules: FirewallFilterRule[]): {
  configured: boolean;
  active: boolean;
  ruleCount: number;
  geoEnabled: boolean;
} {
  const mgmtRules = findMgmtLockRules(rules);
  const geoEnabled = getMgmtAllowCountries().length > 0;
  const required = [
    MGMT_ALLOW_COMMENT,
    MGMT_DROP_LAN_COMMENT,
    MGMT_DROP_REMOTE_COMMENT,
    ...(geoEnabled ? [MGMT_ALLOW_GEO_COMMENT] : []),
  ];
  const byComment = new Map(mgmtRules.map((rule) => [rule.comment, rule]));
  const configured = required.every((comment) => byComment.has(comment));
  const active =
    configured &&
    required.every((comment) => byComment.get(comment)?.disabled !== "true");

  return { configured, active, ruleCount: mgmtRules.length, geoEnabled };
}

async function mikrotikPatch(
  config: MikrotikConfig,
  ruleId: string,
  body: Record<string, string>,
): Promise<void> {
  const url = `${config.host}/rest/ip/firewall/filter/${encodeURIComponent(ruleId)}`;
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `MikroTik PATCH failed: ${response.status}`);
  }
}

async function mikrotikAdd(
  config: MikrotikConfig,
  body: Record<string, string>,
): Promise<string> {
  const url = `${config.host}/rest/ip/firewall/filter/add`;
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `MikroTik add failed: ${response.status}`);
  }
  const data = (await response.json()) as { ".id"?: string };
  return data[".id"] ?? "";
}

async function mikrotikMove(
  config: MikrotikConfig,
  ruleId: string,
  destinationId: string,
): Promise<void> {
  const url = `${config.host}/rest/ip/firewall/filter/move`;
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ numbers: ruleId, destination: destinationId }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `MikroTik move failed: ${response.status}`);
  }
}

async function ensureRule(
  config: MikrotikConfig,
  rules: FirewallFilterRule[],
  comment: string,
  body: Record<string, string>,
  placeBeforeId?: string,
): Promise<{ created: boolean; updated: boolean; ruleId: string }> {
  let rule = rules.find((item) => item.comment === comment);
  let created = false;
  let updated = false;

  if (!rule) {
    const id = await mikrotikAdd(config, {
      ...body,
      comment,
      disabled: "false",
      ...(placeBeforeId ? { "place-before": placeBeforeId } : {}),
    });
    created = true;
    return { created, updated, ruleId: id };
  }

  await mikrotikPatch(config, rule[".id"], {
    ...body,
    disabled: "false",
  });
  updated = true;

  return { created, updated, ruleId: rule[".id"] };
}

/**
 * Правила input на роутере — сохраняются в конфиге RouterOS и переживают перезагрузку.
 * Доступ к WebFig/Winbox/API только с IP из address-list (0_WL + ваш IP панели).
 */
export async function ensureRouterMgmtLock(
  config: MikrotikConfigWithWrite,
  dryRun: boolean,
): Promise<{ updated: number; dryRun: boolean }> {
  const geoEnabled = getMgmtAllowCountries().length > 0;
  if (dryRun) return { updated: geoEnabled ? 4 : 3, dryRun: true };

  const extraIps = (process.env.MIKROTIK_MGMT_EXTRA_IPS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  for (const ip of extraIps) {
    await ensureAddressListEntry(
      config,
      MGMT_WHITELIST_LIST,
      ip,
      "office:mgmt-extra",
      false,
    );
  }

  let rules = await getFirewallRules(config);
  const establishedId = findEstablishedInputId(rules);
  let updated = 0;

  const allow = await ensureRule(
    config,
    rules,
    MGMT_ALLOW_COMMENT,
    {
      chain: "input",
      action: "accept",
      "src-address-list": MGMT_WHITELIST_LIST,
    },
    establishedId,
  );
  if (allow.created || allow.updated) updated++;
  rules = await getFirewallRules(config);

  if (geoEnabled) {
    const allowGeo = await ensureRule(
      config,
      rules,
      MGMT_ALLOW_GEO_COMMENT,
      {
        chain: "input",
        action: "accept",
        "src-address-list": MGMT_GEO_LIST,
      },
      establishedId,
    );
    if (allowGeo.created || allowGeo.updated) updated++;
    rules = await getFirewallRules(config);
  }

  const dropLan = await ensureRule(
    config,
    rules,
    MGMT_DROP_LAN_COMMENT,
    {
      chain: "input",
      action: "drop",
      "src-address": OFFICE_LAN_CIDR,
      protocol: "tcp",
      "dst-port": MGMT_TCP_PORTS,
    },
    establishedId,
  );
  if (dropLan.created || dropLan.updated) updated++;
  rules = await getFirewallRules(config);

  const dropRemote = await ensureRule(
    config,
    rules,
    MGMT_DROP_REMOTE_COMMENT,
    {
      chain: "input",
      action: "drop",
      protocol: "tcp",
      "dst-port": MGMT_TCP_PORTS,
    },
    establishedId,
  );
  if (dropRemote.created || dropRemote.updated) updated++;

  rules = await getFirewallRules(config);
  const ordered = [
    rules.find((r) => r.comment === MGMT_ALLOW_COMMENT),
    geoEnabled ? rules.find((r) => r.comment === MGMT_ALLOW_GEO_COMMENT) : undefined,
    rules.find((r) => r.comment === MGMT_DROP_LAN_COMMENT),
    rules.find((r) => r.comment === MGMT_DROP_REMOTE_COMMENT),
  ].filter(Boolean) as FirewallFilterRule[];

  if (establishedId && ordered.length === (geoEnabled ? 4 : 3)) {
    // move destination = insert immediately BEFORE anchor; iterate reverse so
    // allow-wl → allow-geo → drop-lan → drop-remote → established
    let anchor = establishedId;
    for (const rule of [...ordered].reverse()) {
      if (rule[".id"] === anchor) continue;
      await mikrotikMove(config, rule[".id"], anchor);
      anchor = rule[".id"];
      updated++;
    }
  }

  return { updated, dryRun: false };
}
