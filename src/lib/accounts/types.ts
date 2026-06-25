export type AvitoAccountConfig = {
  id: string;
  label: string;
  clientId?: string;
  clientSecret?: string;
  userId?: number;
  login?: string;
  password?: string;
};

export type CianAccountConfig = {
  id: string;
  label: string;
  apiKey?: string;
  login?: string;
  password?: string;
  url?: string;
  /** Полный URL метода баланса из документации Циан (выдаётся с ключом) */
  balanceUrl?: string;
};

export type Yandex360Config = {
  orgId?: string;
  oauthToken?: string;
  adminLogin?: string;
};

export type AccountsConfig = {
  version: number;
  avito?: AvitoAccountConfig[];
  cian?: CianAccountConfig[];
  yandex360?: Yandex360Config;
};

export type AvitoAccountStatus = {
  id: string;
  label: string;
  login?: string;
  password?: string;
  mode: "api" | "manual";
  configured: boolean;
  connected: boolean;
  userId?: number;
  name?: string;
  email?: string;
  balance?: number;
  bonus?: number;
  currency?: string;
  error?: string;
  hint?: string;
  links: {
    cabinet: string;
    balance: string;
    changePassword: string;
    logoutDevices: string;
    apiPortal: string;
  };
};

export type CianAccountStatus = {
  id: string;
  label: string;
  login?: string;
  password?: string;
  mode: "api" | "manual";
  configured: boolean;
  connected: boolean;
  balance?: number;
  rawBalance?: unknown;
  error?: string;
  hint?: string;
  links: {
    cabinet: string;
    apiSettings: string;
    changePassword: string;
    logoutDevices: string;
  };
};

export type YandexMailUser = {
  id: string;
  email: string;
  name: string;
  position?: string;
  isAdmin: boolean;
  isRobot: boolean;
  isEnabled: boolean;
  isDismissed: boolean;
};

export type Yandex360Status = {
  configured: boolean;
  connected: boolean;
  orgId?: string;
  users: YandexMailUser[];
  totalUsers: number;
  enabledCount: number;
  disabledCount: number;
  manageableActiveCount: number;
  bulkStoppedCount: number;
  error?: string;
  hint?: string;
  links: {
    admin: string;
    oauth: string;
  };
};

export type AccountsStatus = {
  updatedAt: string;
  dryRun: boolean;
  avito: AvitoAccountStatus[];
  cian: CianAccountStatus[];
  yandex360: Yandex360Status;
};

export type AccountActionResult = {
  ok: boolean;
  message: string;
  dryRun: boolean;
  data?: {
    password?: string;
    email?: string;
    name?: string;
    passwordChangeRequired?: boolean;
  };
};
