import { syncPanelWhitelist } from "@/lib/panel-ip";
import { getBitrixConfig } from "@/lib/bitrix";
import { getAccountsConfig } from "@/lib/accounts/config";
import { getAdConfig, isRegistrationDryRun } from "./config";
import { getCloudServerConfig } from "./cloud-server";
import { saveEmployeeCredentials, getEmployeeCredentials } from "./credentials-store";
import { departmentForEmployee, getEmployeeByEmail, listEmployees } from "./employees";
import { findDepartment, loadRegistrationDepartments } from "./departments";
import { createCloudFolder, loadCloudInventory } from "./folders";
import { adEmailExists, createAdUser, loadAdUsers, resolveAdUsersOu, type AdUserRef } from "./ad";
import { bitrixEmailExists, createBitrixUser } from "./bitrix";
import { loadBitrixDepartments } from "./bitrix-departments";
import { loginFromEmail, canonicalNovactivEmail } from "./login";
import { createYandexUser, generatePassword, yandexEmailExists } from "./yandex";
import type {
  EmailCheckResult,
  EmployeeListResult,
  RegistrationInput,
  RegistrationResult,
  RegistrationStatus,
  RegistrationStepResult,
} from "./types";

export { listEmployees, getEmployeeByEmail, getEmployeeCredentials };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateInput(input: RegistrationInput): string | null {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) return "Укажите полный email (например ivanov@novactiv.ru)";
  if (!input.firstName.trim()) return "Укажите имя";
  if (!input.lastName.trim()) return "Укажите фамилию";
  if (!input.departmentId) return "Выберите подразделение";
  if (!input.createYandex && !input.createAd && !input.createBitrix && !input.createFolder) {
    return "Выберите хотя бы один сервис для регистрации";
  }
  if (!input.password || input.password.length < 8) {
    return "Пароль должен быть не короче 8 символов";
  }
  if (input.createBitrix && input.bitrixDepartmentId == null) {
    return "Выберите отдел Bitrix24";
  }
  return null;
}

export async function getRegistrationStatus(options?: {
  skipPanelWhitelist?: boolean;
  adUsersCache?: AdUserRef[];
}): Promise<RegistrationStatus> {
  if (!options?.skipPanelWhitelist) {
    await syncPanelWhitelist().catch(() => undefined);
  }

  const dryRun = isRegistrationDryRun();
  const [adConfig, bitrixConfig, accountsConfig, cloudConfig] = await Promise.all([
    Promise.resolve(getAdConfig()),
    Promise.resolve(getBitrixConfig()),
    getAccountsConfig(),
    getCloudServerConfig(),
  ]);
  const yandexConfigured = !!(
    accountsConfig.yandex360?.orgId && accountsConfig.yandex360?.oauthToken
  );

  const hints: string[] = [];
  if (!adConfig) {
    hints.push("AD: задайте AD_BIND_USER и AD_BIND_PASSWORD в .env.local");
  }
  if (!bitrixConfig) {
    hints.push("Bitrix24: задайте BITRIX24_WEBHOOK_URL");
  }
  if (!yandexConfigured) {
    hints.push("Yandex 360: задайте YANDEX360_OAUTH_TOKEN и YANDEX360_ORG_ID");
  }
  if (!cloudConfig) {
    hints.push(
      "Сетевые папки: нужен Reg.ru API (REGRU_USERNAME/PASSWORD) или CLOUD_SERVER_* в .env.local",
    );
  } else {
    hints.push(
      `Сетевые папки: ${cloudConfig.hostname} (${cloudConfig.host}) — WinRM :${cloudConfig.winrmPort}`,
    );
  }
  hints.push(
    "Подразделение AD — из OU Active Directory. Отдел Bitrix24 выбирается отдельно в форме регистрации.",
  );

  try {
    const [departments, bitrixDepartments] = await Promise.all([
      loadRegistrationDepartments(options?.adUsersCache),
      loadBitrixDepartments().catch(() => []),
    ]);
    return {
      configured: !!(adConfig || bitrixConfig || yandexConfigured || cloudConfig),
      dryRun,
      departments,
      bitrixDepartments,
      services: {
        yandex: yandexConfigured,
        ad: !!adConfig,
        bitrix: !!bitrixConfig,
        cloud: !!cloudConfig,
      },
      hints,
    };
  } catch (error) {
    return {
      configured: false,
      dryRun,
      departments: [],
      bitrixDepartments: [],
      services: {
        yandex: yandexConfigured,
        ad: !!adConfig,
        bitrix: !!bitrixConfig,
        cloud: !!cloudConfig,
      },
      hints,
      error: error instanceof Error ? error.message : "Не удалось загрузить подразделения",
    };
  }
}

export async function checkRegistrationEmail(email: string): Promise<EmailCheckResult> {
  const normalized = normalizeEmail(email);
  const login = loginFromEmail(normalized);
  const messages: string[] = [];

  const [yandex, ad, bitrix, cloudInventory] = await Promise.all([
    yandexEmailExists(normalized).catch(() => false),
    getAdConfig()
      ? adEmailExists(getAdConfig()!, normalized).catch(() => false)
      : Promise.resolve(false),
    bitrixEmailExists(normalized).catch(() => false),
    loadCloudInventory().catch(() => ({ users: new Set<string>(), folders: new Set<string>() })),
  ]);
  const cloud = login ? cloudInventory.users.has(login) : false;
  const cloudFolder = login ? cloudInventory.folders.has(login) : false;

  if (yandex) messages.push("Яндекс 360: email уже занят");
  if (ad) messages.push("Active Directory: email уже занят");
  if (bitrix) messages.push("Bitrix24: email уже занят");
  if (cloud) messages.push("Cloud: учётка уже есть");
  if (cloudFolder) messages.push("Cloud: личная папка уже есть");

  return {
    ok: !yandex && !ad && !bitrix && !cloud && !cloudFolder,
    exists: { yandex, ad, bitrix, cloud, cloudFolder },
    messages,
  };
}

export async function getEmployeeList(): Promise<EmployeeListResult> {
  const adConfig = getAdConfig();
  const adUsers = adConfig
    ? await loadAdUsers(adConfig).catch(() => [] as AdUserRef[])
    : [];

  const registrationStatus = await getRegistrationStatus({
    skipPanelWhitelist: true,
    adUsersCache: adUsers,
  });
  const list = await listEmployees(registrationStatus, { adUsersCache: adUsers });
  return { ...list, registrationStatus };
}

export async function syncEmployeeServices(input: RegistrationInput): Promise<RegistrationResult> {
  const status = await getRegistrationStatus();
  const employee = await getEmployeeByEmail(input.email, status);

  if (!employee) {
    return registerEmployee(input, { mode: "sync" });
  }

  const syncedInput: RegistrationInput = {
    ...input,
    departmentId: input.departmentId || employee.departmentId || "",
    createYandex: input.createYandex && !employee.services.yandex,
    createAd: input.createAd && !employee.services.ad,
    createBitrix: input.createBitrix && !employee.services.bitrix,
    createFolder: input.createFolder && !employee.services.cloudFolder,
  };

  if (
    !syncedInput.createYandex &&
    !syncedInput.createAd &&
    !syncedInput.createBitrix &&
    !syncedInput.createFolder
  ) {
    return {
      ok: false,
      dryRun: isRegistrationDryRun(),
      message: "Выбранные сервисы уже зарегистрированы для этого email",
      steps: [],
    };
  }

  return registerEmployee(syncedInput, { mode: "sync" });
}

export async function registerEmployee(
  input: RegistrationInput,
  options: { mode?: "full" | "sync" } = {},
): Promise<RegistrationResult> {
  const mode = options.mode ?? "full";
  const dryRun = isRegistrationDryRun();
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, dryRun, message: validationError, steps: [] };
  }

  const email = normalizeEmail(input.email);
  const password = input.password.trim() || generatePassword();
  const departments = await loadRegistrationDepartments();
  let department = findDepartment(departments, input.departmentId);

  if (!department && mode === "sync") {
    const status = await getRegistrationStatus();
    const employee = await getEmployeeByEmail(email, status);
    if (employee) {
      department = departmentForEmployee(employee, departments);
    }
  }

  if (!department) {
    return { ok: false, dryRun, message: "Подразделение не найдено", steps: [] };
  }

  const whitelist = await syncPanelWhitelist();
  if (!whitelist.synced && whitelist.error && !dryRun) {
    console.warn("[registration] panel whitelist sync:", whitelist.error);
  }

  const steps: RegistrationStepResult[] = [];

  if (mode === "full") {
    const duplicate = await checkRegistrationEmail(email);
    if (!duplicate.ok) {
      return {
        ok: false,
        dryRun,
        message: duplicate.messages.join(". "),
        steps: [
          {
            id: "validate",
            label: "Проверка email",
            ok: false,
            message: duplicate.messages.join("; "),
          },
        ],
      };
    }

    steps.push({
      id: "validate",
      label: "Проверка email",
      ok: true,
      message: "Email свободен во всех выбранных системах",
    });
  } else {
    steps.push({
      id: "validate",
      label: "Проверка email",
      ok: true,
      message: "Дозапись в недостающие сервисы",
    });
  }

  if (input.createYandex) {
    if (!department.yandexDepartmentId) {
      steps.push({
        id: "yandex",
        label: "Яндекс 360",
        ok: false,
        message:
          "Не задан yandexDepartmentId для этого подразделения. Укажите в .data/registration-departments.json",
      });
    } else {
      const result = await createYandexUser(
        {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          middleName: input.middleName?.trim(),
          position: input.position?.trim(),
          birthDate: input.birthDate,
          departmentId: department.yandexDepartmentId,
          password,
          passwordChangeRequired: input.passwordChangeRequired,
        },
        dryRun,
      );

      steps.push({
        id: "yandex",
        label: "Яндекс 360",
        ok: result.ok,
        message: result.ok
          ? dryRun
            ? `[Dry-run] Почта ${email} была бы создана в подразделении «${department.name}»`
            : `Почта ${email} создана (отдел Yandex #${department.yandexDepartmentId})`
          : result.error,
      });

      if (!result.ok) {
        return await finalize(false, dryRun, steps, email, password, department.name, input);
      }
    }
  } else {
    steps.push({
      id: "yandex",
      label: "Яндекс 360",
      ok: true,
      skipped: true,
      message: "Пропущено",
    });
  }

  if (input.createAd) {
    const adConfig = getAdConfig();
    if (!adConfig) {
      steps.push({
        id: "ad",
        label: "Active Directory",
        ok: false,
        message: "AD не настроен",
      });
    } else {
      const ouDn = await resolveAdUsersOu(adConfig, department.adOu || adConfig.defaultUsersOu!);
      const result = await createAdUser(
        adConfig,
        {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          middleName: input.middleName?.trim(),
          position: input.position?.trim(),
          ouDn,
          password,
        },
        dryRun,
      );

      steps.push({
        id: "ad",
        label: "Active Directory",
        ok: result.ok,
        message: result.ok
          ? dryRun
            ? `[Dry-run] Учётка AD была бы создана в «${department.name}»`
            : `Учётка AD создана в «${department.name}». ${result.note ?? ""}`
          : result.error,
      });

      if (!result.ok) {
        return await finalize(false, dryRun, steps, email, password, department.name, input);
      }
    }
  } else {
    steps.push({
      id: "ad",
      label: "Active Directory",
      ok: true,
      skipped: true,
      message: "Пропущено",
    });
  }

  if (input.createBitrix) {
    const bitrixDepartmentId =
      input.bitrixDepartmentId ?? department.bitrixDepartmentId;
    if (bitrixDepartmentId == null) {
      steps.push({
        id: "bitrix",
        label: "Bitrix24",
        ok: false,
        message: "Не выбран отдел Bitrix24",
      });
    } else {
      const bitrixDeptName =
        (await loadBitrixDepartments().catch(() => [])).find((d) => d.id === bitrixDepartmentId)
          ?.name ?? `#${bitrixDepartmentId}`;

      const result = await createBitrixUser(
        {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          middleName: input.middleName?.trim(),
          position: input.position?.trim(),
          birthDate: input.birthDate,
          departmentId: bitrixDepartmentId,
          password,
        },
        dryRun,
      );

      steps.push({
        id: "bitrix",
        label: "Bitrix24",
        ok: result.ok,
        message: result.ok
          ? dryRun
            ? `[Dry-run] Пользователь Bitrix был бы добавлен в «${bitrixDeptName}»`
            : `Пользователь Bitrix создан в отделе «${bitrixDeptName}»`
          : result.error,
      });

      if (!result.ok) {
        return await finalize(false, dryRun, steps, email, password, department.name, input);
      }
    }
  } else {
    steps.push({
      id: "bitrix",
      label: "Bitrix24",
      ok: true,
      skipped: true,
      message: "Пропущено",
    });
  }

  if (input.createFolder) {
    const result = await createCloudFolder(email, password, dryRun);
    steps.push({
      id: "folder",
      label: "Сетевая папка (cloud.novactiv.ru)",
      ok: result.ok,
      message: result.ok ? result.message : result.error,
    });
    if (!result.ok) {
      return await finalize(false, dryRun, steps, email, password, department.name, input);
    }
  } else {
    steps.push({
      id: "folder",
      label: "Сетевая папка",
      ok: true,
      skipped: true,
      message: "Пропущено",
    });
  }

  const allOk = steps.every((s) => s.ok || s.skipped);
  return await finalize(allOk, dryRun, steps, email, password, department.name, input);
}

async function finalize(
  ok: boolean,
  dryRun: boolean,
  steps: RegistrationStepResult[],
  email: string,
  password: string,
  departmentName: string,
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const failed = steps.find((s) => !s.ok && !s.skipped);
  const message = ok
    ? dryRun
      ? `[Dry-run] Регистрация ${email} в «${departmentName}» прошла бы успешно`
      : `Сотрудник ${email} зарегистрирован в «${departmentName}»`
    : failed?.message ?? "Ошибка регистрации";

  let data: RegistrationResult["data"];
  if (ok) {
    const login = loginFromEmail(email);
    data = await saveEmployeeCredentials({
      email: canonicalNovactivEmail(login),
      password,
      login,
      departmentName,
      firstName: input.firstName.trim() || undefined,
      lastName: input.lastName.trim() || undefined,
      dryRun,
    });
  }

  return {
    ok,
    dryRun,
    message,
    steps,
    data,
  };
}
