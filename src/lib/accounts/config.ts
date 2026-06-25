import { readFile } from "fs/promises";
import path from "path";
import type { AccountsConfig, AvitoAccountConfig, CianAccountConfig, Yandex360Config } from "./types";
import {
  getVaultAvitoAccounts,
  getVaultCianAccounts,
  mergeAvitoAccounts,
  mergeCianAccounts,
} from "./vault-sources";

const DEFAULT_FILE = path.join(process.cwd(), ".data", "accounts.json");

function envAvitoAccounts(): AvitoAccountConfig[] {
  const clientId = process.env.AVITO_CLIENT_ID;
  const clientSecret = process.env.AVITO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  return [
    {
      id: "avito-default",
      label: process.env.AVITO_LABEL ?? "Avito",
      clientId,
      clientSecret,
      userId: process.env.AVITO_USER_ID ? Number(process.env.AVITO_USER_ID) : undefined,
      login: process.env.AVITO_LOGIN,
    },
  ];
}

function envCianAccounts(): CianAccountConfig[] {
  const accounts: CianAccountConfig[] = [];

  const commercial = process.env.CIAN_API_KEY_COMMERCIAL;
  if (commercial) {
    accounts.push({
      id: "cian-commercial",
      label: "Циан Коммерция",
      apiKey: commercial,
      login: process.env.CIAN_LOGIN_COMMERCIAL ?? "info@novactiv.ru",
      balanceUrl: process.env.CIAN_BALANCE_URL_COMMERCIAL,
    });
  }

  const residential = process.env.CIAN_API_KEY_RESIDENTIAL;
  if (residential) {
    accounts.push({
      id: "cian-residential",
      label: "Циан Жилая",
      apiKey: residential,
      login: process.env.CIAN_LOGIN_RESIDENTIAL ?? "infovtorich@novactiv.ru",
      balanceUrl: process.env.CIAN_BALANCE_URL_RESIDENTIAL,
    });
  }

  const single = process.env.CIAN_API_KEY;
  if (single && accounts.length === 0) {
    accounts.push({
      id: "cian-default",
      label: "Циан",
      apiKey: single,
      login: process.env.CIAN_LOGIN,
      balanceUrl: process.env.CIAN_BALANCE_URL,
    });
  }

  return accounts;
}

function envYandex360(): Yandex360Config | undefined {
  const token = process.env.YANDEX360_OAUTH_TOKEN;
  const orgId = process.env.YANDEX360_ORG_ID;
  if (!token && !orgId) return undefined;

  return {
    oauthToken: token,
    orgId,
    adminLogin: process.env.YANDEX360_ADMIN_LOGIN,
  };
}

export async function getAccountsConfig(): Promise<AccountsConfig> {
  let fromFile: AccountsConfig | null = null;

  try {
    const file = process.env.ACCOUNTS_FILE ?? DEFAULT_FILE;
    const raw = await readFile(file, "utf-8");
    fromFile = JSON.parse(raw) as AccountsConfig;
  } catch {
    // optional file
  }

  const avitoRaw = [...(fromFile?.avito ?? []), ...envAvitoAccounts()];
  const cianRaw = [...(fromFile?.cian ?? []), ...envCianAccounts()];

  const [vaultAvito, vaultCian] = await Promise.all([
    getVaultAvitoAccounts(),
    getVaultCianAccounts(),
  ]);

  const avito = mergeAvitoAccounts(dedupeById(avitoRaw), vaultAvito);
  const cian = mergeCianAccounts(dedupeById(cianRaw), vaultCian);

  const yandexFromFile = fromFile?.yandex360;
  const yandexFromEnv = envYandex360();
  const yandex360: Yandex360Config | undefined =
    yandexFromFile || yandexFromEnv
      ? {
          orgId: yandexFromEnv?.orgId ?? yandexFromFile?.orgId,
          oauthToken: yandexFromEnv?.oauthToken ?? yandexFromFile?.oauthToken,
          adminLogin: yandexFromEnv?.adminLogin ?? yandexFromFile?.adminLogin,
        }
      : undefined;

  return {
    version: fromFile?.version ?? 1,
    avito,
    cian,
    yandex360,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

export function isAccountsDryRun(): boolean {
  return process.env.ACCOUNTS_DRY_RUN !== "false";
}
