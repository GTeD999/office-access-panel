import { getAccountsConfig } from "@/lib/accounts/config";
import { generatePassword } from "@/lib/accounts/yandex360";

const API = "https://api360.yandex.net";

async function yandexFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
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
    const err =
      (data as { message?: string }).message ||
      (data as { error?: string }).error ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    throw new Error(err);
  }

  return data as T;
}

async function listYandexUsersRaw(
  orgId: string,
  token: string,
): Promise<Array<{ email?: string; name?: { first?: string; last?: string } }>> {
  const users: Array<{ email?: string; name?: { first?: string; last?: string } }> = [];
  let page = 1;

  while (page <= 20) {
    const data = await yandexFetch<{
      users?: Array<{ email?: string; name?: { first?: string; last?: string } }>;
      pages?: number;
    }>(token, `/directory/v1/org/${orgId}/users?page=${page}&perPage=100`);

    users.push(...(data.users ?? []));

    if (!data.users?.length || (data.pages && page >= data.pages)) break;
    page += 1;
  }

  return users;
}

async function listYandexEmails(orgId: string, token: string): Promise<Set<string>> {
  const emails = new Set<string>();
  const users = await listYandexUsersRaw(orgId, token);
  for (const user of users) {
    if (user.email) emails.add(user.email.toLowerCase());
  }
  return emails;
}

export async function loadYandexEmailSet(): Promise<Set<string>> {
  const config = await getAccountsConfig();
  const orgId = config.yandex360?.orgId;
  const token = config.yandex360?.oauthToken;
  if (!orgId || !token) return new Set();
  return listYandexEmails(orgId, token);
}

export async function yandexEmailExists(email: string): Promise<boolean> {
  const config = await getAccountsConfig();
  const orgId = config.yandex360?.orgId;
  const token = config.yandex360?.oauthToken;
  if (!orgId || !token) return false;

  const emails = await listYandexEmails(orgId, token);
  return emails.has(email.trim().toLowerCase());
}

export async function createYandexUser(
  input: {
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    position?: string;
    birthDate?: string;
    departmentId: number;
    password: string;
    passwordChangeRequired?: boolean;
  },
  dryRun: boolean,
): Promise<{ ok: true; userId: string; email: string } | { ok: false; error: string }> {
  const config = await getAccountsConfig();
  const orgId = config.yandex360?.orgId;
  const token = config.yandex360?.oauthToken;

  if (!orgId || !token) {
    return { ok: false, error: "Yandex 360 не настроен" };
  }

  const email = input.email.trim().toLowerCase();
  const nickname = email.split("@")[0] ?? email;

  if (dryRun) {
    return { ok: true, userId: "dry-run", email };
  }

  try {
    const body: Record<string, unknown> = {
      nickname,
      name: {
        first: input.firstName,
        last: input.lastName,
        ...(input.middleName ? { middle: input.middleName } : {}),
      },
      password: input.password,
      departmentId: input.departmentId,
      passwordChangeRequired: input.passwordChangeRequired !== false,
    };

    if (input.position) body.position = input.position;
    if (input.birthDate) body.birthday = input.birthDate;

    const created = await yandexFetch<{ id: string | number; email?: string }>(
      token,
      `/directory/v1/org/${orgId}/users`,
      { method: "POST", body: JSON.stringify(body) },
    );

    return {
      ok: true,
      userId: String(created.id),
      email: created.email ?? email,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка Yandex 360";
    return { ok: false, error: message };
  }
}

export { generatePassword };
