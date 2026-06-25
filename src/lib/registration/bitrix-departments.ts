import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { getBitrixConfig, BitrixError } from "@/lib/bitrix";

export type BitrixDepartmentOption = {
  id: number;
  name: string;
  memberCount?: number;
};

type BitrixDepartmentsFile = {
  version: number;
  departments?: Array<{ id: number; name: string }>;
};

const DATA_FILE = path.join(process.cwd(), ".data", "bitrix-departments.json");

async function loadNameOverrides(): Promise<Map<number, string>> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as BitrixDepartmentsFile;
    return new Map(
      (parsed.departments ?? [])
        .filter((d) => d.id != null && d.name?.trim())
        .map((d) => [d.id, d.name.trim()]),
    );
  } catch {
    return new Map();
  }
}

async function fetchDepartmentsFromApi(): Promise<BitrixDepartmentOption[] | null> {
  const config = getBitrixConfig();
  if (!config) return null;

  try {
    const url = `${config.webhookUrl}/department.get.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      result?: Array<{ ID: string; NAME?: string }>;
      error?: string;
    };
    if (!response.ok || body.error) return null;

    return (body.result ?? [])
      .map((dept) => ({
        id: Number(dept.ID),
        name: dept.NAME?.trim() || `Отдел #${dept.ID}`,
      }))
      .filter((dept) => Number.isFinite(dept.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  } catch {
    return null;
  }
}

async function collectDepartmentUsage(): Promise<Map<number, number>> {
  const config = getBitrixConfig();
  const counts = new Map<number, number>();
  if (!config) return counts;

  let start = 0;
  while (true) {
    const url = `${config.webhookUrl}/user.get.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        FILTER: { ACTIVE: true },
        SELECT: ["UF_DEPARTMENT"],
        start,
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      result?: Array<{ UF_DEPARTMENT?: number[] }>;
      next?: number;
      error?: string;
    };
    if (!response.ok || body.error) {
      throw new BitrixError(body.error || "Bitrix24 user.get failed", response.status);
    }

    for (const user of body.result ?? []) {
      for (const id of user.UF_DEPARTMENT ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    if (body.next == null) break;
    start = body.next;
  }

  return counts;
}

/** Список отделов Bitrix24 для выбора при регистрации. */
export async function loadBitrixDepartments(): Promise<BitrixDepartmentOption[]> {
  const fromApi = await fetchDepartmentsFromApi();
  const usage = await collectDepartmentUsage().catch(() => new Map<number, number>());
  const nameOverrides = await loadNameOverrides();

  if (fromApi?.length) {
    return fromApi.map((dept) => ({
      ...dept,
      memberCount: usage.get(dept.id) ?? 0,
    }));
  }

  const ids = new Set<number>([...usage.keys(), ...nameOverrides.keys()]);
  return [...ids]
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      name: nameOverrides.get(id) ?? `Отдел #${id}`,
      memberCount: usage.get(id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export async function saveBitrixDepartmentsSnapshot(
  departments: BitrixDepartmentOption[],
): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const payload: BitrixDepartmentsFile = {
    version: 1,
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
  };
  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
}
