import { readFile } from "fs/promises";
import path from "path";
import type { CredentialsStore } from "./credentials-types";

const DEFAULT_FILE = path.join(process.cwd(), ".data", "credentials.json");

const MIKROTIK_ENV_URLS: Record<string, string | undefined> = {
  "mt-sov95": process.env.MIKROTIK_HOST,
  "mt-sov36": process.env.MIKROTIK_SOV36_HOST,
  "mt-line27": process.env.MIKROTIK_LINE27_HOST,
};

function enrichStore(store: CredentialsStore): CredentialsStore {
  return {
    ...store,
    categories: store.categories.map((category) => {
      if (category.id !== "mikrotik") return category;

      return {
        ...category,
        entries: category.entries.map((entry) => {
          if (entry.url || entry.host) return entry;
          const fromEnv = MIKROTIK_ENV_URLS[entry.id];
          if (!fromEnv) return entry;
          return { ...entry, url: fromEnv.replace(/\/$/, "") };
        }),
      };
    }),
  };
}

export async function getCredentialsStore(): Promise<CredentialsStore | null> {
  const file = process.env.CREDENTIALS_FILE ?? DEFAULT_FILE;

  try {
    const raw = await readFile(file, "utf-8");
    return enrichStore(JSON.parse(raw) as CredentialsStore);
  } catch {
    return null;
  }
}
