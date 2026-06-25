import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { createHash } from "node:crypto";
import { getBitrixConfig } from "@/lib/bitrix";
import { getAccountsConfig } from "@/lib/accounts/config";
import {
  getAdConfig,
  getSkipOus,
  getDefaultBitrixDepartmentId,
  getDefaultYandexDepartmentId,
} from "./config";
import {
  countUsersInOuCached,
  listRegistrationOUs,
  loadAdUsers,
  userBelongsToOu,
  type AdUserRef,
} from "./ad";
import type { RegistrationDepartment } from "./types";

type DepartmentOverride = {
  id?: string;
  name?: string;
  adOu?: string;
  bitrixDepartmentId?: number;
  yandexDepartmentId?: number;
};

type DepartmentsFile = {
  version: number;
  departments?: DepartmentOverride[];
};

const DATA_FILE = path.join(process.cwd(), ".data", "registration-departments.json");

function slugify(name: string, dn: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const hash = createHash("md5").update(dn).digest("hex").slice(0, 6);
  return `${base || "dept"}-${hash}`;
}

function mode(values: Array<number | undefined>): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: number | undefined;
  let max = 0;
  for (const [id, count] of counts) {
    if (count > max) {
      best = id;
      max = count;
    }
  }
  return best;
}

async function loadOverrides(): Promise<DepartmentOverride[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DepartmentsFile;
    return parsed.departments ?? [];
  } catch {
    return [];
  }
}

function emailsInOu(users: AdUserRef[], ouDn: string): string[] {
  return users
    .filter((user) => user.distinguishedName && userBelongsToOu(user.distinguishedName, ouDn))
    .map((user) => (user.mail || user.userPrincipalName || "").toLowerCase())
    .filter(Boolean);
}

async function correlateIdsByEmail(
  ouDns: string[],
  users: AdUserRef[],
): Promise<Map<string, { bitrix?: number; yandex?: number }>> {
  const map = new Map<string, { bitrix?: number; yandex?: number }>();

  const bitrixConfig = getBitrixConfig();
  const accountsConfig = await getAccountsConfig();
  const orgId = accountsConfig.yandex360?.orgId;
  const token = accountsConfig.yandex360?.oauthToken;

  if (!bitrixConfig || !orgId || !token) return map;

  const bitrixByEmail = new Map<string, number>();
  let start = 0;
  while (true) {
    const response = await fetch(`${bitrixConfig.webhookUrl}/user.get.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        FILTER: { ACTIVE: true },
        SELECT: ["EMAIL", "UF_DEPARTMENT"],
        start,
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      result?: Array<{ EMAIL?: string; UF_DEPARTMENT?: number[] }>;
      next?: number;
    };
    for (const user of body.result ?? []) {
      const email = user.EMAIL?.toLowerCase();
      const dept = user.UF_DEPARTMENT?.[0];
      if (email && dept != null) bitrixByEmail.set(email, dept);
    }
    if (body.next == null) break;
    start = body.next;
  }

  const yandexByEmail = new Map<string, number>();
  let page = 1;
  while (page <= 20) {
    const response = await fetch(
      `https://api360.yandex.net/directory/v1/org/${orgId}/users?page=${page}&perPage=100`,
      { headers: { Authorization: `OAuth ${token}` }, cache: "no-store" },
    );
    const body = (await response.json()) as {
      users?: Array<{ email?: string; departmentId?: number }>;
      pages?: number;
    };
    for (const user of body.users ?? []) {
      const email = user.email?.toLowerCase();
      if (email && user.departmentId != null) yandexByEmail.set(email, user.departmentId);
    }
    if (!body.users?.length || (body.pages && page >= body.pages)) break;
    page += 1;
  }

  for (const ouDn of ouDns) {
    const emails = emailsInOu(users, ouDn);
    map.set(ouDn, {
      bitrix: mode(emails.map((email) => bitrixByEmail.get(email))),
      yandex: mode(emails.map((email) => yandexByEmail.get(email))),
    });
  }

  return map;
}

export async function loadRegistrationDepartments(
  adUsersCache?: AdUserRef[],
): Promise<RegistrationDepartment[]> {
  const adConfig = getAdConfig();
  const overrides = await loadOverrides();
  const overrideByOu = new Map(
    overrides.filter((o) => o.adOu).map((o) => [o.adOu as string, o]),
  );
  const skip = getSkipOus();

  if (!adConfig) {
    return overrides
      .filter((o) => o.name && o.id)
      .map((o) => ({
        id: o.id as string,
        name: o.name as string,
        adOu: o.adOu ?? "",
        bitrixDepartmentId: o.bitrixDepartmentId,
        yandexDepartmentId: o.yandexDepartmentId,
      }));
  }

  const [ous, users] = await Promise.all([
    listRegistrationOUs(adConfig),
    adUsersCache
      ? Promise.resolve(adUsersCache)
      : loadAdUsers(adConfig).catch(() => [] as AdUserRef[]),
  ]);

  const ouDns = ous.filter((ou) => !skip.has(ou.name)).map((ou) => ou.dn);
  const correlation = await correlateIdsByEmail(ouDns, users).catch(() => new Map());

  const departments: RegistrationDepartment[] = [];
  const defaultBitrix = getDefaultBitrixDepartmentId();
  const defaultYandex = getDefaultYandexDepartmentId();

  for (const ou of ous) {
    if (skip.has(ou.name)) continue;

    const override = overrideByOu.get(ou.dn);
    const corr = correlation.get(ou.dn);
    const memberCount = countUsersInOuCached(users, ou.dn);

    departments.push({
      id: override?.id ?? slugify(ou.name, ou.dn),
      name: override?.name ?? ou.name,
      adOu: ou.dn,
      bitrixDepartmentId: override?.bitrixDepartmentId ?? corr?.bitrix ?? defaultBitrix,
      yandexDepartmentId: override?.yandexDepartmentId ?? corr?.yandex ?? defaultYandex,
      memberCount,
    });
  }

  departments.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return departments;
}

export async function saveDepartmentsSnapshot(
  departments: RegistrationDepartment[],
): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const payload: DepartmentsFile = {
    version: 1,
    departments: departments.map((d) => ({
      id: d.id,
      name: d.name,
      adOu: d.adOu,
      bitrixDepartmentId: d.bitrixDepartmentId,
      yandexDepartmentId: d.yandexDepartmentId,
    })),
  };
  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

export function findDepartment(
  departments: RegistrationDepartment[],
  departmentId: string,
): RegistrationDepartment | undefined {
  return departments.find((d) => d.id === departmentId);
}
