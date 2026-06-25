import type { AvitoAccountConfig, AvitoAccountStatus } from "./types";

const API = "https://api.avito.ru";

type AvitoToken = { access_token: string; token_type: string };

function defaultLinks() {
  return {
    cabinet: "https://www.avito.ru/professionals",
    balance: "https://www.avito.ru/account",
    changePassword: "https://www.avito.ru/profile/safety",
    logoutDevices: "https://www.avito.ru/profile/safety",
    apiPortal: "https://www.avito.ru/professionals/api",
  };
}

function manualStatus(account: AvitoAccountConfig): AvitoAccountStatus {
  const hasLogin = !!account.login?.trim();
  return {
    id: account.id,
    label: account.label,
    login: account.login,
    password: account.password,
    mode: "manual",
    configured: hasLogin,
    connected: hasLogin,
    links: defaultLinks(),
    hint: hasLogin
      ? "API Авито доступен только на платном тарифе. Логин/пароль из хранилища — баланс и выход со всех устройств в личном кабинете."
      : "Укажите login в accounts.json или добавьте запись Avito в хранилище",
  };
}

async function getToken(clientId: string, clientSecret: string): Promise<AvitoToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${API}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as AvitoToken & {
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }

  return data;
}

async function avitoGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: T | Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as T) : {};
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err = (data as { message?: string }).message || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(err);
  }

  return data as T;
}

export async function getAvitoAccountStatus(
  account: AvitoAccountConfig,
): Promise<AvitoAccountStatus> {
  const hasApi = !!(account.clientId?.trim() && account.clientSecret?.trim());
  if (!hasApi) return manualStatus(account);

  const base: AvitoAccountStatus = {
    id: account.id,
    label: account.label,
    login: account.login,
    password: account.password,
    mode: "api",
    configured: true,
    connected: false,
    links: defaultLinks(),
  };

  try {
    const token = await getToken(account.clientId!, account.clientSecret!);

    const self = await avitoGet<{
      id?: number;
      name?: string;
      email?: string;
    }>(token.access_token, "/core/v1/accounts/self");

    const userId = account.userId ?? self.id;
    let balance: number | undefined;
    let bonus: number | undefined;

    if (userId) {
      try {
        const wallet = await avitoGet<{
          real?: number;
          bonus?: number;
          balance?: number;
        }>(token.access_token, `/core/v1/accounts/${userId}/balance/`);

        balance = wallet.real ?? wallet.balance;
        bonus = wallet.bonus;
      } catch {
        // balance may require paid API tier
      }
    }

    return {
      ...base,
      connected: true,
      userId,
      name: self.name,
      email: self.email,
      balance,
      bonus,
      currency: "RUB",
      hint:
        balance === undefined
          ? "Баланс через API недоступен на вашем тарифе — откройте «Баланс» в кабинете"
          : undefined,
    };
  } catch (error) {
    const manual = manualStatus(account);
    return {
      ...manual,
      error:
        (error instanceof Error ? error.message : "Ошибка Avito API") +
        ". Используется ручной режим.",
    };
  }
}
