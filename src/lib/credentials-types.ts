export type CredentialIcon =
  | "router"
  | "monitor"
  | "server"
  | "printer"
  | "cloud"
  | "user"
  | "desktop"
  | "globe"
  | "hard-drive"
  | "scan";

export type CredentialLink = {
  label: string;
  url: string;
  primary?: boolean;
};

export type CredentialEntry = {
  id: string;
  label: string;
  username?: string;
  password?: string;
  host?: string;
  url?: string;
  note?: string;
  tags?: string[];
  links?: CredentialLink[];
  /** Reg.ru Cloud VPS — токен API (ЛК → Облачные VPS → Настройки) */
  apiToken?: string;
  /** Пользовательский Internet-ID сервер (если не глобальный TektonIT) */
  internetIdServer?: string;
  internetIdPort?: string;
};

export type CredentialCategory = {
  id: string;
  title: string;
  description?: string;
  icon: CredentialIcon;
  entries: CredentialEntry[];
};

export type CredentialsStore = {
  version: number;
  featured?: CredentialEntry[];
  categories: CredentialCategory[];
};
