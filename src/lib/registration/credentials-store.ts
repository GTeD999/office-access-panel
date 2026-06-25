import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { adUpnFromLogin, canonicalCompanyEmail, loginFromEmail } from "./login";
import { buildCloudFolderPath } from "./cloud-server";
import type { StoredEmployeeCredentials } from "./types";
import { resolveDisplayName } from "./display-name";

type CredentialsFile = {
  version: number;
  employees: Record<string, StoredEmployeeCredentials>;
};

const DATA_FILE = path.join(process.cwd(), ".data", "employee-credentials.json");

async function loadFile(): Promise<CredentialsFile> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CredentialsFile;
    return {
      version: parsed.version ?? 1,
      employees: parsed.employees ?? {},
    };
  } catch {
    return { version: 1, employees: {} };
  }
}

async function saveFile(data: CredentialsFile): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function saveEmployeeCredentials(input: {
  email: string;
  password: string;
  login?: string;
  departmentName?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  dryRun?: boolean;
}): Promise<StoredEmployeeCredentials> {
  const login = (input.login ?? loginFromEmail(input.email)).toLowerCase();
  const email = canonicalCompanyEmail(login);
  const record: StoredEmployeeCredentials = {
    login,
    email,
    password: input.password,
    adUpn: adUpnFromLogin(login),
    cloudUser: `cloud\\${login}`,
    cloudFolder: buildCloudFolderPath(login),
    departmentName: input.departmentName,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: resolveDisplayName(input),
    updatedAt: new Date().toISOString(),
    dryRun: input.dryRun,
  };

  const file = await loadFile();
  file.employees[login] = record;
  await saveFile(file);
  return record;
}

export async function getEmployeeCredentials(
  loginOrEmail: string,
): Promise<StoredEmployeeCredentials | null> {
  const login = loginOrEmail.includes("@")
    ? loginFromEmail(loginOrEmail)
    : loginOrEmail.trim().toLowerCase();
  if (!login) return null;

  const file = await loadFile();
  return file.employees[login] ?? null;
}

export async function getCredentialsLoginSet(): Promise<Set<string>> {
  const file = await loadFile();
  return new Set(Object.keys(file.employees));
}
