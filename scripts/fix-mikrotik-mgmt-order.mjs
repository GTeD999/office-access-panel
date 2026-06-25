#!/usr/bin/env node
/**
 * Одноразовый фикс порядка novactiv:mgmt-lock правил на MikroTik.
 * Запускать с IP из whitelist (0_WL), пока GEO ещё не работает.
 *
 *   node --env-file=.env.local scripts/fix-mikrotik-mgmt-order.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  } catch {
    // ignore
  }
}

loadEnv();

const host = process.env.MIKROTIK_HOST?.replace(/\/$/, "");
const user = process.env.MIKROTIK_USERNAME;
const pass = process.env.MIKROTIK_PASSWORD;
if (!host || !user || !pass) {
  console.error("Задайте MIKROTIK_HOST, MIKROTIK_USERNAME, MIKROTIK_PASSWORD");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

async function api(path, init) {
  const res = await fetch(`${host}/rest${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const PREFIX = "novactiv:mgmt-lock";
const COMMENTS = [
  `${PREFIX}:allow-wl`,
  `${PREFIX}:allow-geo`,
  `${PREFIX}:drop-lan`,
  `${PREFIX}:drop-remote`,
];

async function main() {
  console.log("Подключение к", host);
  const resource = await api("/system/resource");
  console.log("OK:", resource["board-name"], resource.version);

  const rules = await api("/ip/firewall/filter");
  const input = rules.filter((r) => r.chain === "input");
  const established = input.find(
    (r) =>
      r.action === "accept" &&
      (r.comment?.toLowerCase().includes("established") ||
        r.comment?.toLowerCase().includes("related")),
  );
  if (!established) throw new Error("Не найдено правило established/related");

  const mgmt = COMMENTS.map((c) => input.find((r) => r.comment === c)).filter(Boolean);
  if (mgmt.length < 3) throw new Error(`Найдено только ${mgmt.length} mgmt-lock правил`);

  console.log("Текущий порядок:");
  for (const r of input) {
    if ((r.comment ?? "").startsWith(PREFIX)) console.log(" ", r.comment);
  }

  let anchor = established[".id"];
  const ordered = mgmt;
  for (const rule of [...ordered].reverse()) {
    if (rule[".id"] === anchor) continue;
    await api("/ip/firewall/filter/move", {
      method: "POST",
      body: JSON.stringify({ numbers: rule[".id"], destination: anchor }),
    });
    anchor = rule[".id"];
    console.log("Перемещено перед anchor:", rule.comment);
  }

  const rules2 = await api("/ip/firewall/filter");
  console.log("\nНовый порядок:");
  for (const r of rules2.filter((x) => x.chain === "input")) {
    if ((r.comment ?? "").startsWith(PREFIX)) console.log(" ", r.comment);
  }
  console.log("\nГотово. Вьетнам (GEO_MGMT) должен проходить.");
}

main().catch((e) => {
  console.error("ОШИБКА:", e.message);
  process.exit(1);
});
