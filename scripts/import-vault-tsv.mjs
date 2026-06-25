#!/usr/bin/env node
/**
 * Импорт TSV-экспорта (Bitwarden / Passbolt) в .data/vault.json
 * Usage: node scripts/import-vault-tsv.mjs path/to/export.tsv
 */
import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".data", "vault.json");

const GROUP_MAP = {
  "Корень/Агенты": { id: "agents", title: "Агенты", description: "Учётные записи сотрудников" },
  "Корень/Сервисы": { id: "services", title: "Сервисы", description: "Внешние сервисы и инфраструктура" },
  "Корень/запасные пароли": { id: "spare", title: "Запасные пароли", description: "" },
  "Корень/Корзина": { id: "trash", title: "Корзина", description: "Уволенные / неактивные" },
};

function slugify(text) {
  return String(text || "entry")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function parseTsv(raw) {
  const rows = [];
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return rows;

  const header = lines[0].split("\t").map((h) => h.trim());
  const idx = {
    group: header.indexOf("Group"),
    title: header.indexOf("Title"),
    username: header.indexOf("Username"),
    password: header.indexOf("Password"),
    url: header.indexOf("URL"),
    notes: header.indexOf("Notes"),
    updated: header.indexOf("Last Modified"),
    created: header.indexOf("Created"),
  };

  let current = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const startsRecord =
      line.startsWith("Корень/") && line.split("\t").length >= 4;

    if (startsRecord) {
      if (current) rows.push(current);
      const parts = line.split("\t");
      current = {
        group: parts[idx.group] ?? "",
        title: parts[idx.title] ?? "",
        username: parts[idx.username] ?? "",
        password: parts[idx.password] ?? "",
        url: parts[idx.url] ?? "",
        notes: parts[idx.notes] ?? "",
        updatedAt: parts[idx.updated] ?? "",
        createdAt: parts[idx.created] ?? "",
      };
    } else if (current) {
      current.notes = current.notes ? `${current.notes}\n${line}` : line;
    }
  }

  if (current) rows.push(current);
  return rows;
}

function buildStore(rows) {
  const buckets = new Map();

  for (const meta of Object.values(GROUP_MAP)) {
    buckets.set(meta.id, { ...meta, entries: [] });
  }

  const usedIds = new Set();

  for (const row of rows) {
    const cat = GROUP_MAP[row.group];
    if (!cat) continue;

    let id = slugify(row.username || row.title);
    if (!id) id = `entry-${buckets.get(cat.id).entries.length}`;
    let unique = id;
    let n = 2;
    while (usedIds.has(unique)) {
      unique = `${id}-${n++}`;
    }
    usedIds.add(unique);

    buckets.get(cat.id).entries.push({
      id: unique,
      title: row.title.trim() || row.username || "—",
      username: row.username?.trim() || undefined,
      password: row.password?.trim() || undefined,
      url: row.url?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      group: row.group,
      updatedAt: row.updatedAt?.trim() || undefined,
      createdAt: row.createdAt?.trim() || undefined,
    });
  }

  for (const bucket of buckets.values()) {
    bucket.entries.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }

  return {
    version: 1,
    source: "bitwarden-tsv",
    importedAt: new Date().toISOString(),
    categories: [...buckets.values()].filter((c) => c.entries.length > 0),
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node scripts/import-vault-tsv.mjs <export.tsv>");
    process.exit(1);
  }

  const raw = await readFile(path.resolve(input), "utf-8");
  const rows = parseTsv(raw);
  const store = buildStore(rows);

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(store, null, 2), "utf-8");

  console.log(`Imported ${rows.length} rows → ${OUT}`);
  for (const c of store.categories) {
    console.log(`  ${c.title}: ${c.entries.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
