export type BitrixDepartmentOption = {
  id: number;
  name: string;
  memberCount?: number;
};

export type RegistrationDepartment = {
  id: string;
  name: string;
  adOu: string;
  bitrixDepartmentId?: number;
  yandexDepartmentId?: number;
  memberCount?: number;
};

export type RegistrationStepId = "validate" | "yandex" | "ad" | "bitrix" | "folder";

export type RegistrationStepResult = {
  id: RegistrationStepId;
  label: string;
  ok: boolean;
  skipped?: boolean;
  message: string;
};

export type RegistrationStatus = {
  configured: boolean;
  dryRun: boolean;
  departments: RegistrationDepartment[];
  bitrixDepartments: BitrixDepartmentOption[];
  services: {
    yandex: boolean;
    ad: boolean;
    bitrix: boolean;
    cloud: boolean;
  };
  hints: string[];
  error?: string;
};

export type RegistrationInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate?: string;
  position?: string;
  departmentId: string;
  /** Отдел Bitrix24 (UF_DEPARTMENT). Если не задан — берётся из подсказки AD-подразделения. */
  bitrixDepartmentId?: number;
  createYandex: boolean;
  createAd: boolean;
  createBitrix: boolean;
  createFolder: boolean;
  passwordChangeRequired?: boolean;
};

export type RegistrationResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  steps: RegistrationStepResult[];
  data?: StoredEmployeeCredentials;
};

export type StoredEmployeeCredentials = {
  login: string;
  email: string;
  password: string;
  adUpn: string;
  cloudUser: string;
  cloudFolder: string;
  departmentName?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  updatedAt: string;
  dryRun?: boolean;
};

export type EmailCheckResult = {
  ok: boolean;
  exists: {
    yandex: boolean;
    ad: boolean;
    bitrix: boolean;
    cloud: boolean;
    cloudFolder: boolean;
  };
  messages: string[];
};

export type EmployeeServices = {
  yandex: boolean;
  ad: boolean;
  bitrix: boolean;
  /** Учётка cloud\login (доступ к сетевым папкам) */
  cloud: boolean;
  /** Личная папка Storage\login */
  cloudFolder: boolean;
};

export type EmployeeRecord = {
  email: string;
  login: string;
  /** UPN в AD — обычно login@novactiv.com */
  adUpn?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  departmentId?: string;
  departmentName?: string;
  services: EmployeeServices;
  complete: boolean;
  missing: Array<keyof EmployeeServices>;
  /** Пароль сохранён локально после регистрации через панель */
  hasCredentials?: boolean;
};

export type EmployeeListResult = {
  ok: boolean;
  dryRun: boolean;
  employees: EmployeeRecord[];
  total: number;
  incomplete: number;
  services: RegistrationStatus["services"];
  registrationStatus?: RegistrationStatus;
  error?: string;
};
