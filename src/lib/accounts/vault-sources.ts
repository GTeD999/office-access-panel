import { getVaultStore } from "@/lib/vault";
import type { AvitoAccountConfig, CianAccountConfig } from "./types";

function slugifyLogin(login: string): string {
  return login.replace(/[^a-z0-9@._-]+/gi, "-").toLowerCase();
}

export async function getVaultAvitoAccounts(): Promise<AvitoAccountConfig[]> {
  const vault = await getVaultStore();
  if (!vault) return [];

  const entries =
    vault.categories.find((c) => c.id === "services")?.entries ??
    vault.categories.flatMap((c) => c.entries);

  return entries
    .filter((e) => /avito/i.test(e.title))
    .map((e) => ({
      id: `vault-avito-${e.id}`,
      label: e.title,
      login: e.username,
      password: e.password,
    }));
}

export async function getVaultCianAccounts(): Promise<CianAccountConfig[]> {
  const vault = await getVaultStore();
  if (!vault) return [];

  const entries =
    vault.categories.find((c) => c.id === "services")?.entries ??
    vault.categories.flatMap((c) => c.entries);

  return entries
    .filter((e) => /cian|циан/i.test(e.title))
    .map((e) => ({
      id: `vault-cian-${e.id}`,
      label: e.title,
      login: e.username,
      password: e.password,
      url: e.url,
    }));
}

export function mergeAvitoAccounts(
  primary: AvitoAccountConfig[],
  fromVault: AvitoAccountConfig[],
): AvitoAccountConfig[] {
  const byLogin = new Map<string, AvitoAccountConfig>();

  for (const item of primary) {
    const key = item.login?.toLowerCase() ?? item.id;
    byLogin.set(key, item);
  }

  for (const item of fromVault) {
    const key = item.login?.toLowerCase() ?? item.id;
    const existing = byLogin.get(key);
    if (existing) {
      byLogin.set(key, {
        ...existing,
        password: existing.password ?? item.password,
        label: existing.label || item.label,
      });
    } else {
      byLogin.set(key, item);
    }
  }

  return [...byLogin.values()];
}

export function mergeCianAccounts(
  primary: CianAccountConfig[],
  fromVault: CianAccountConfig[],
): CianAccountConfig[] {
  const byLogin = new Map<string, CianAccountConfig>();

  for (const item of primary) {
    const key = item.login?.toLowerCase() ?? item.id;
    byLogin.set(key, item);
  }

  for (const item of fromVault) {
    const key = item.login?.toLowerCase() ?? item.id;
    const existing = byLogin.get(key);
    if (existing) {
      byLogin.set(key, {
        ...existing,
        password: existing.password ?? item.password,
        label: existing.label || item.label,
      });
    } else {
      byLogin.set(key, item);
    }
  }

  return [...byLogin.values()];
}

export { slugifyLogin };
