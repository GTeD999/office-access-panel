export type AdConfig = {
  host: string;
  ldapsHost?: string;
  baseDn: string;
  bindUser: string;
  bindPassword: string;
  defaultUsersOu?: string;
  folderShare?: string;
};

const SKIP_OUS = new Set([
  "Domain Controllers",
  "Admin",
  "install",
  "Residential Areas",
  "Рабочие станции",
]);

const GENERIC_OU_NAMES = new Set(["Сотрудники", "Руководитель", "install"]);

/** Контейнер — в списке регистрации только его дочерние OU */
export const COMMERCIAL_PARENT_OU = "Коммерческие отделы";

export function getSkipOus(): Set<string> {
  const extra = process.env.AD_SKIP_OUS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return new Set([...SKIP_OUS, ...GENERIC_OU_NAMES, ...extra]);
}

export function getDefaultBitrixDepartmentId(): number | undefined {
  const raw = process.env.REGISTRATION_DEFAULT_BITRIX_DEPT;
  return raw ? Number(raw) : undefined;
}

export function getDefaultYandexDepartmentId(): number | undefined {
  const raw = process.env.REGISTRATION_DEFAULT_YANDEX_DEPT;
  return raw ? Number(raw) : undefined;
}

export function isRegistrationDryRun(): boolean {
  return process.env.REGISTRATION_DRY_RUN !== "false";
}

export function getAdConfig(): AdConfig | null {
  const host = process.env.AD_HOST;
  const bindUser = process.env.AD_BIND_USER ?? process.env.AD_USERNAME;
  const bindPassword = process.env.AD_BIND_PASSWORD ?? process.env.AD_PASSWORD;

  if (!host || !bindUser || !bindPassword) {
    return null;
  }

  return {
    host,
    ldapsHost: process.env.AD_LDAPS_HOST,
    baseDn: process.env.AD_BASE_DN ?? "DC=example,DC=com",
    bindUser,
    bindPassword,
    defaultUsersOu: process.env.AD_DEFAULT_USERS_OU,
    folderShare: process.env.AD_FOLDER_SHARE,
  };
}
