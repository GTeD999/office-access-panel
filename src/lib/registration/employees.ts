import { getAdConfig, isRegistrationDryRun } from "./config";
import { loadAdUsers, userBelongsToOu, type AdUserRef } from "./ad";
import { loadBitrixEmailSet } from "./bitrix";
import { loadCloudInventory } from "./folders";
import { getCredentialsLoginSet } from "./credentials-store";
import { findDepartment } from "./departments";
import { canonicalCompanyEmail, isCompanyEmail, loginFromEmail } from "./login";
import { loadYandexEmailSet } from "./yandex";
import type {
  EmployeeListResult,
  EmployeeRecord,
  EmployeeServices,
  RegistrationStatus,
} from "./types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userEmail(user: AdUserRef): string {
  return normalizeEmail(user.mail || user.userPrincipalName || "");
}

function adLogin(user: AdUserRef): string {
  const raw = user.sAMAccountName ?? loginFromEmail(userEmail(user));
  return raw.trim().toLowerCase();
}

function hasServiceByLogin(emailSet: Set<string>, login: string): boolean {
  for (const email of emailSet) {
    if (loginFromEmail(email) === login) return true;
  }
  return false;
}

function buildServices(
  login: string,
  yandex: Set<string>,
  adLogins: Set<string>,
  bitrix: Set<string>,
  cloudUsers: Set<string>,
  cloudFolders: Set<string>,
): EmployeeServices {
  return {
    yandex: hasServiceByLogin(yandex, login),
    ad: adLogins.has(login),
    bitrix: hasServiceByLogin(bitrix, login),
    cloud: cloudUsers.has(login),
    cloudFolder: cloudFolders.has(login),
  };
}

function computeMissing(
  services: EmployeeServices,
  configured: RegistrationStatus["services"],
): Array<keyof EmployeeServices> {
  const missing: Array<keyof EmployeeServices> = [];
  if (configured.yandex && !services.yandex) missing.push("yandex");
  if (configured.ad && !services.ad) missing.push("ad");
  if (configured.bitrix && !services.bitrix) missing.push("bitrix");
  if (configured.cloud && !services.cloud) missing.push("cloud");
  if (configured.cloud && !services.cloudFolder) missing.push("cloudFolder");
  return missing;
}

function findDepartmentForDn(
  dn: string,
  departments: RegistrationStatus["departments"],
) {
  return departments.find((dept) => dept.adOu && userBelongsToOu(dn, dept.adOu));
}

function mergeEmployee(
  current: EmployeeRecord | undefined,
  patch: Partial<EmployeeRecord> & { adUpnCandidate?: string },
): EmployeeRecord {
  const login = (patch.login ?? current?.login ?? "").trim().toLowerCase();
  const adUpn =
    patch.adUpn ??
    current?.adUpn ??
    (patch.adUpnCandidate?.endsWith("@example.net")
      ? normalizeEmail(patch.adUpnCandidate)
      : undefined);

  return {
    email: canonicalCompanyEmail(login),
    login,
    adUpn,
    firstName: patch.firstName ?? current?.firstName,
    lastName: patch.lastName ?? current?.lastName,
    displayName: patch.displayName ?? current?.displayName,
    departmentId: patch.departmentId ?? current?.departmentId,
    departmentName: patch.departmentName ?? current?.departmentName,
    services: patch.services ?? current?.services ?? {
      yandex: false,
      ad: false,
      bitrix: false,
      cloud: false,
      cloudFolder: false,
    },
    complete: false,
    missing: [],
  };
}

export async function listEmployees(
  status: RegistrationStatus,
  options?: { adUsersCache?: AdUserRef[] },
): Promise<EmployeeListResult> {
  const dryRun = isRegistrationDryRun();
  const adConfig = getAdConfig();

  try {
    const departments = status.departments;
    const [yandexEmails, bitrixEmails, cloudInventory, adUsers, credentialsLogins] =
      await Promise.all([
      loadYandexEmailSet(),
      loadBitrixEmailSet(),
      loadCloudInventory(),
      options?.adUsersCache
        ? Promise.resolve(options.adUsersCache)
        : adConfig
          ? loadAdUsers(adConfig)
          : Promise.resolve([] as AdUserRef[]),
      getCredentialsLoginSet(),
    ]);

    const adLoginSet = new Set<string>();
    for (const user of adUsers) {
      const login = adLogin(user);
      if (login) adLoginSet.add(login);
    }

    const byLogin = new Map<string, EmployeeRecord>();

    const upsert = (login: string, patch: Partial<EmployeeRecord> & { adUpnCandidate?: string }) => {
      if (!login) return;
      const merged = mergeEmployee(byLogin.get(login), {
        login,
        ...patch,
        services: buildServices(
          login,
          yandexEmails,
          adLoginSet,
          bitrixEmails,
          cloudInventory.users,
          cloudInventory.folders,
        ),
      });
      byLogin.set(login, merged);
    };

    for (const user of adUsers) {
      const login = adLogin(user);
      if (!login) continue;

      const department = user.distinguishedName
        ? findDepartmentForDn(user.distinguishedName, departments)
        : undefined;
      const upn = userEmail(user);

      upsert(login, {
        adUpnCandidate: upn || undefined,
        firstName: user.givenName,
        lastName: user.sn,
        displayName: user.displayName,
        departmentId: department?.id,
        departmentName: department?.name,
      });
    }

    for (const email of [...yandexEmails, ...bitrixEmails]) {
      if (!isCompanyEmail(email)) continue;
      const login = loginFromEmail(email);
      if (!login) continue;
      upsert(login, {});
    }

    const employees = [...byLogin.values()]
      .map((employee) => {
        const services = employee.services;
        const missing = computeMissing(services, status.services);
        return {
          ...employee,
          services,
          missing,
          complete: missing.length === 0,
          hasCredentials: credentialsLogins.has(employee.login),
        };
      })
      .sort((a, b) => {
        const nameA = (a.displayName || `${a.lastName ?? ""} ${a.firstName ?? ""}`).trim();
        const nameB = (b.displayName || `${b.lastName ?? ""} ${b.firstName ?? ""}`).trim();
        return nameA.localeCompare(nameB, "ru") || a.email.localeCompare(b.email);
      });

    return {
      ok: true,
      dryRun,
      employees,
      total: employees.length,
      incomplete: employees.filter((e) => !e.complete).length,
      services: status.services,
    };
  } catch (error) {
    return {
      ok: false,
      dryRun,
      employees: [],
      total: 0,
      incomplete: 0,
      services: status.services,
      error: error instanceof Error ? error.message : "Не удалось загрузить список сотрудников",
    };
  }
}

export async function getEmployeeByEmail(
  email: string,
  status: RegistrationStatus,
): Promise<EmployeeRecord | null> {
  const normalized = normalizeEmail(email);
  const login = loginFromEmail(normalized);
  const list = await listEmployees(status);
  return (
    list.employees.find((employee) => employee.login === login || employee.email === normalized) ??
    null
  );
}

export function departmentForEmployee(
  employee: EmployeeRecord,
  departments: RegistrationStatus["departments"],
) {
  if (employee.departmentId) {
    return findDepartment(departments, employee.departmentId);
  }
  return undefined;
}
