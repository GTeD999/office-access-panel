import { readFile } from "fs/promises";
import path from "path";
import type { VaultStore } from "./vault-types";

const DEFAULT_FILE = path.join(process.cwd(), ".data", "vault.json");

export async function getVaultStore(): Promise<VaultStore | null> {
  const file = process.env.VAULT_FILE ?? DEFAULT_FILE;

  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as VaultStore;
  } catch {
    return null;
  }
}
