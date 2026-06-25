import { spawn } from "node:child_process";
import path from "node:path";
import { buildCloudFolderPath, getCloudServerConfig } from "./cloud-server";
import { loginFromEmail } from "./login";

type ProvisionResult =
  | { ok: true; message: string; path: string; dryRun?: boolean }
  | { ok: false; error: string };

type ScriptJson = Record<string, unknown> & { ok?: boolean; error?: string };

export type CloudInventory = {
  users: Set<string>;
  folders: Set<string>;
};

const CLOUD_SYSTEM_ACCOUNTS = new Set([
  "administrator",
  "defaultaccount",
  "guest",
  "wdagutilityaccount",
]);

function normalizeLogin(name: string): string {
  return String(name).trim().toLowerCase();
}

function toLoginSet(names: unknown[]): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const login = normalizeLogin(String(name));
    if (!login || CLOUD_SYSTEM_ACCOUNTS.has(login)) continue;
    set.add(login);
  }
  return set;
}

async function runCloudScript(payload: Record<string, unknown>): Promise<ScriptJson> {
  const scriptPath = path.join(process.cwd(), "scripts", "provision-cloud-folder.py");

  return new Promise((resolve) => {
    const child = spawn("python3", [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      try {
        resolve(JSON.parse(stdout.trim()) as ScriptJson);
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || `Скрипт завершился с кодом ${code}`,
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runProvisionScript(payload: Record<string, unknown>): Promise<ProvisionResult> {
  const parsed = await runCloudScript(payload);
  if (parsed.ok) {
    return {
      ok: true,
      message: String(parsed.message ?? ""),
      path: String(parsed.path ?? ""),
      dryRun: Boolean(parsed.dryRun),
    };
  }
  return { ok: false, error: String(parsed.error ?? "Ошибка cloud-скрипта") };
}

export async function loadCloudInventory(): Promise<CloudInventory> {
  const config = await getCloudServerConfig();
  if (!config) {
    return { users: new Set(), folders: new Set() };
  }

  const parsed = await runCloudScript({
    action: "list",
    host: config.host,
    adminUser: config.adminUser,
    adminPassword: config.adminPassword,
  });

  if (!parsed.ok) {
    return { users: new Set(), folders: new Set() };
  }

  return {
    users: toLoginSet(Array.isArray(parsed.users) ? parsed.users : []),
    folders: toLoginSet(Array.isArray(parsed.folders) ? parsed.folders : []),
  };
}

/** @deprecated Используйте loadCloudInventory */
export async function loadCloudLoginSet(): Promise<Set<string>> {
  const inventory = await loadCloudInventory();
  return inventory.users;
}

export async function createCloudFolder(
  email: string,
  userPassword: string,
  dryRun: boolean,
): Promise<ProvisionResult> {
  const config = await getCloudServerConfig();
  const login = loginFromEmail(email);

  if (!login) {
    return { ok: false, error: "Не удалось определить логин из email" };
  }

  if (!config) {
    return {
      ok: false,
      error:
        "Сервер cloud.novactiv.ru не настроен — задайте CLOUD_SERVER_* в .env.local или Reg.ru API",
    };
  }

  if (dryRun) {
    const folderPath = buildCloudFolderPath(login, config.hostname);
    return {
      ok: true,
      dryRun: true,
      message: `[Dry-run] cloud\\${login}, папка Storage\\${login}, права сотруднику и админам`,
      path: folderPath,
    };
  }

  return runProvisionScript({
    action: "create",
    host: config.host,
    adminUser: config.adminUser,
    adminPassword: config.adminPassword,
    login,
    userPassword,
    dryRun: false,
  });
}

export { loginFromEmail };
