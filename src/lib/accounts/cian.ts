import type { CianAccountConfig, CianAccountStatus } from "./types";

function defaultLinks(login?: string) {
  const base = "https://my.cian.ru";
  return {
    cabinet: login?.includes("@") ? base : "https://novosibirsk.cian.ru/",
    apiSettings: `${base}/settings/api`,
    changePassword: `${base}/settings/registration`,
    logoutDevices: `${base}/settings/security`,
  };
}

function manualStatus(account: CianAccountConfig): CianAccountStatus {
  const hasLogin = !!account.login?.trim();
  return {
    id: account.id,
    label: account.label,
    login: account.login,
    password: account.password,
    mode: "manual",
    configured: hasLogin,
    connected: hasLogin,
    links: defaultLinks(account.login),
    hint: hasLogin
      ? "API-ключ Циан выдаётся отдельно (Настройки → Циан API). Без ключа — вход по логину/паролю и ссылки в кабинет."
      : "Укажите login или добавьте запись Циан в хранилище",
  };
}

async function tryBalance(
  apiKey: string,
  balanceUrl?: string,
): Promise<{ balance?: number; raw?: unknown }> {
  if (!balanceUrl) return {};

  const res = await fetch(balanceUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      typeof raw === "object" && raw && "message" in raw
        ? String((raw as { message: string }).message)
        : `HTTP ${res.status}`,
    );
  }

  const balance =
    typeof raw === "object" && raw
      ? Number(
          (raw as { balance?: number; result?: { balance?: number } }).balance ??
            (raw as { result?: { balance?: number } }).result?.balance,
        )
      : undefined;

  return {
    balance: Number.isFinite(balance) ? balance : undefined,
    raw,
  };
}

export async function getCianAccountStatus(
  account: CianAccountConfig,
): Promise<CianAccountStatus> {
  if (!account.apiKey?.trim()) return manualStatus(account);

  const base: CianAccountStatus = {
    id: account.id,
    label: account.label,
    login: account.login,
    password: account.password,
    mode: "api",
    configured: true,
    connected: false,
    links: defaultLinks(account.login),
  };

  if (!account.balanceUrl) {
    return {
      ...base,
      connected: true,
      hint:
        "Ключ API есть. Добавьте balanceUrl в accounts.json (URL метода из письма Циан) или пользуйтесь кабинетом.",
    };
  }

  try {
    const { balance, raw } = await tryBalance(account.apiKey, account.balanceUrl);
    return {
      ...base,
      connected: true,
      balance,
      rawBalance: raw,
    };
  } catch (error) {
    const manual = manualStatus(account);
    return {
      ...manual,
      error:
        (error instanceof Error ? error.message : "Ошибка Циан API") +
        ". Доступен ручной режим.",
    };
  }
}
