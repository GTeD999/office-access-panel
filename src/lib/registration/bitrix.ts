import { getBitrixConfig, BitrixError } from "@/lib/bitrix";
import type { BitrixConfig } from "@/lib/bitrix";

type BitrixUser = {
  ID: string;
  EMAIL?: string;
  UF_DEPARTMENT?: number[];
};

async function bitrixCall<T>(
  config: BitrixConfig,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const url = `${config.webhookUrl}/${method}.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    result?: T;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || body.error) {
    throw new BitrixError(
      body.error_description || body.error || `Bitrix24 API: ${response.status}`,
      response.status,
    );
  }

  return body.result as T;
}

export async function bitrixEmailExists(email: string): Promise<boolean> {
  const config = getBitrixConfig();
  if (!config) return false;

  const normalized = email.trim().toLowerCase();
  const users = await bitrixCall<BitrixUser[]>(config, "user.get", {
    FILTER: { EMAIL: normalized },
    SELECT: ["ID", "EMAIL"],
  });

  return (users ?? []).some((u) => (u.EMAIL ?? "").toLowerCase() === normalized);
}

export async function loadBitrixEmailSet(): Promise<Set<string>> {
  const config = getBitrixConfig();
  if (!config) return new Set();

  const emails = new Set<string>();
  let start = 0;

  while (true) {
    const users = await bitrixCall<BitrixUser[]>(config, "user.get", {
      FILTER: { ACTIVE: true },
      SELECT: ["ID", "EMAIL"],
      start,
    });

    for (const user of users ?? []) {
      const email = (user.EMAIL ?? "").trim().toLowerCase();
      if (email) emails.add(email);
    }

    if (!users?.length || users.length < 50) break;
    start += users.length;
    if (start > 5000) break;
  }

  return emails;
}

export async function createBitrixUser(
  input: {
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    position?: string;
    birthDate?: string;
    departmentId: number;
    password: string;
  },
  dryRun: boolean,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const config = getBitrixConfig();
  if (!config) {
    return { ok: false, error: "Bitrix24 не настроен" };
  }

  const email = input.email.trim().toLowerCase();
  const login = email.split("@")[0] ?? email;

  if (dryRun || config.dryRun) {
    return { ok: true, userId: "dry-run" };
  }

  try {
    const params: Record<string, unknown> = {
      EMAIL: email,
      LOGIN: login,
      NAME: input.firstName,
      LAST_NAME: input.lastName,
      PASSWORD: input.password,
      CONFIRM_PASSWORD: input.password,
      UF_DEPARTMENT: [input.departmentId],
      ACTIVE: "Y",
    };

    if (input.middleName) params.SECOND_NAME = input.middleName;
    if (input.position) params.WORK_POSITION = input.position;
    if (input.birthDate) params.PERSONAL_BIRTHDAY = input.birthDate;

    const userId = await bitrixCall<string | number>(config, "user.add", params);
    return { ok: true, userId: String(userId) };
  } catch (error) {
    const message = error instanceof BitrixError ? error.message : "Ошибка Bitrix24";
    return { ok: false, error: message };
  }
}
