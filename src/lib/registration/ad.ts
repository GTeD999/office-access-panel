import { spawn } from "node:child_process";
import path from "node:path";
import ldap from "ldapjs";
import type { AdConfig } from "./config";
import { COMMERCIAL_PARENT_OU, getSkipOus } from "./config";
import { adUpnFromLogin, canonicalNovactivEmail, loginFromEmail, samAccountNameFromEmail } from "./login";

let adLdapChain: Promise<unknown> = Promise.resolve();

function withAdLdapLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = adLdapChain.then(fn, fn);
  adLdapChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function escapeLdap(value: string): string {
  return value.replace(/[\\*()\0]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)}`);
}

function ldapSearch<T extends Record<string, string | string[] | undefined>>(
  config: AdConfig,
  base: string,
  filter: string,
  attributes: string[],
  sizeLimit = 100,
  scope: "sub" | "one" = "sub",
): Promise<T[]> {
  return withAdLdapLock(() => ldapSearchUnsafe(config, base, filter, attributes, sizeLimit, scope));
}

function ldapSearchUnsafe<T extends Record<string, string | string[] | undefined>>(
  config: AdConfig,
  base: string,
  filter: string,
  attributes: string[],
  sizeLimit = 100,
  scope: "sub" | "one" = "sub",
): Promise<T[]> {
  const client = ldap.createClient({
    url: config.host,
    timeout: 15_000,
    connectTimeout: 15_000,
  });

  return new Promise((resolve, reject) => {
    client.bind(config.bindUser, config.bindPassword, (bindErr) => {
      if (bindErr) {
        client.destroy();
        reject(bindErr);
        return;
      }

      const rows: T[] = [];
      client.search(
        base,
        { filter, scope, attributes, sizeLimit },
        (searchErr, res) => {
          if (searchErr) {
            client.unbind(() => client.destroy());
            reject(searchErr);
            return;
          }

          res.on("searchEntry", (entry) => {
            const row = {} as T;
            for (const attr of entry.attributes) {
              const key = attr.type as keyof T;
              const values = attr.values as string[];
              (row as Record<string, string | string[]>)[key as string] =
                values.length === 1 ? values[0] : values;
            }
            rows.push(row);
          });

          res.on("error", (err) => {
            client.unbind(() => client.destroy());
            reject(err);
          });

          res.on("end", () => {
            client.unbind(() => client.destroy());
            resolve(rows);
          });
        },
      );
    });
  });
}

const USERS_CONTAINER_DN = "CN=Users,DC=novactiv,DC=com";

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatinAscii(text: string): string {
  return text
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (!mapped) return char;
      return char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join("");
}

function ldapAdd(
  config: AdConfig,
  dn: string | ldap.DN,
  entry: Record<string, string | string[]>,
): Promise<void> {
  const client = ldap.createClient({
    url: config.host,
    timeout: 15_000,
    connectTimeout: 15_000,
  });

  return new Promise((resolve, reject) => {
    client.bind(config.bindUser, config.bindPassword, (bindErr) => {
      if (bindErr) {
        client.destroy();
        reject(bindErr);
        return;
      }

      client.add(typeof dn === "string" ? dn : dn.toString(), entry, (addErr: Error | null) => {
        client.unbind(() => client.destroy());
        if (addErr) reject(addErr);
        else resolve();
      });
    });
  });
}

function ldapModify(
  config: AdConfig,
  dn: string,
  change: ldap.Change,
): Promise<void> {
  const client = ldap.createClient({
    url: config.host,
    timeout: 15_000,
    connectTimeout: 15_000,
  });

  return new Promise((resolve, reject) => {
    client.bind(config.bindUser, config.bindPassword, (bindErr) => {
      if (bindErr) {
        client.destroy();
        reject(bindErr);
        return;
      }

      client.modify(dn, change, (modErr: Error | null) => {
        client.unbind(() => client.destroy());
        if (modErr) reject(modErr);
        else resolve();
      });
    });
  });
}

/** Группы доступа коммерческих отделов (CN в AD) */
const AD_COMMERCIAL_GROUPS = {
  commercial1_users: "CN=commercial1_users,CN=Users,DC=novactiv,DC=com",
  commercial2_users: "CN=commercial2_users,CN=Users,DC=novactiv,DC=com",
} as const;

/** По фамилии руководителя в OU подбираем группу сотрудников */
export function resolveAdGroupDn(departmentOu: string): string | null {
  const ou = departmentOu.toLowerCase();
  if (ou.includes("блинов") || ou.includes("литвинова")) {
    return AD_COMMERCIAL_GROUPS.commercial1_users;
  }
  if (ou.includes("горн") || ou.includes("валова")) {
    return AD_COMMERCIAL_GROUPS.commercial2_users;
  }
  if (ou.includes("коммерч")) {
    return AD_COMMERCIAL_GROUPS.commercial2_users;
  }
  return null;
}

export async function addAdGroupMember(
  config: AdConfig,
  groupDn: string,
  userDn: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const change = new ldap.Change({
      operation: "add",
      modification: new ldap.Attribute({ type: "member", values: [userDn] }),
    });
    await ldapModify(config, groupDn, change);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка AD";
    if (message.includes("Already Exists") || message.includes("ENTRY_ALREADY_EXISTS")) {
      return { ok: true };
    }
    return { ok: false, error: message };
  }
}

function buildAdUserDn(cnForRdn: string): ldap.DN {
  const parent = ldap.parseDN(USERS_CONTAINER_DN);
  const userDn = parent.clone();
  userDn.unshift(new ldap.RDN({ CN: cnForRdn }));
  return userDn;
}

async function runAdMoveScript(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  dn?: string;
  message?: string;
  error?: string;
  skipped?: boolean;
}> {
  const scriptPath = path.join(process.cwd(), "scripts", "ad-move-user.py");

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

    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout.trim()) as {
          ok: boolean;
          dn?: string;
          message?: string;
          error?: string;
          skipped?: boolean;
        });
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || "Ошибка ad-move-user.py",
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runAdActivateScript(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  enabled?: boolean;
  passwordSet?: boolean;
}> {
  const scriptPath = path.join(process.cwd(), "scripts", "ad-activate-user.py");

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

    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout.trim()) as {
          ok: boolean;
          message?: string;
          error?: string;
          enabled?: boolean;
          passwordSet?: boolean;
        });
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || "Ошибка ad-activate-user.py",
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function activateAdUser(
  config: AdConfig,
  input: { samAccountName: string; password?: string },
  dryRun: boolean,
): Promise<{ ok: true; message: string; passwordSet: boolean } | { ok: false; error: string }> {
  const result = await runAdActivateScript({
    host: config.host,
    ldapsHost: config.ldapsHost,
    bindUser: config.bindUser,
    bindPassword: config.bindPassword,
    samAccountName: input.samAccountName,
    password: input.password,
    dryRun,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Не удалось активировать учётку AD" };
  }

  return {
    ok: true,
    message: result.message ?? "Учётка AD включена",
    passwordSet: Boolean(result.passwordSet),
  };
}

/** Перенос в целевой OU (кириллица) через Python ldap3 */
export async function moveAdUserToOu(
  config: AdConfig,
  input: {
    samAccountName: string;
    cn: string;
    targetOuDn: string;
  },
  dryRun: boolean,
): Promise<{ ok: true; dn: string; skipped?: boolean } | { ok: false; error: string }> {
  const result = await runAdMoveScript({
    host: config.host,
    bindUser: config.bindUser,
    bindPassword: config.bindPassword,
    samAccountName: input.samAccountName,
    cn: input.cn,
    targetOuDn: input.targetOuDn,
    dryRun,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Не удалось перенести пользователя AD" };
  }

  const dn = result.dn ?? `CN=${input.cn},${input.targetOuDn}`;
  return { ok: true, dn, skipped: result.skipped };
}

function ldapRenameUser(
  config: AdConfig,
  userDn: string,
  newCn: string,
): Promise<void> {
  const client = ldap.createClient({
    url: config.host,
    timeout: 15_000,
    connectTimeout: 15_000,
  });

  return new Promise((resolve, reject) => {
    client.bind(config.bindUser, config.bindPassword, (bindErr) => {
      if (bindErr) {
        client.destroy();
        reject(bindErr);
        return;
      }

      client.modifyDN(userDn, `CN=${newCn}`, (renameErr: Error | null) => {
        client.unbind(() => client.destroy());
        if (renameErr) reject(renameErr);
        else resolve();
      });
    });
  });
}

export type AdOu = {
  name: string;
  dn: string;
};

export type AdUserRef = {
  distinguishedName: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  sn?: string;
  displayName?: string;
  sAMAccountName?: string;
};

function mapOuRows(
  rows: Array<{ distinguishedName?: string; ou?: string }>,
): AdOu[] {
  return rows
    .map((row) => {
      const dn = row.distinguishedName ?? "";
      const name = row.ou ?? /OU=([^,]+)/.exec(dn)?.[1] ?? "";
      return { name, dn };
    })
    .filter((ou) => ou.name && ou.dn);
}

export function userBelongsToOu(userDn: string, ouDn: string): boolean {
  const user = userDn.toLowerCase();
  const ou = ouDn.toLowerCase();
  return user.includes(`,${ou},`) || user.endsWith(`,${ou}`);
}

export async function loadAdUsers(config: AdConfig): Promise<AdUserRef[]> {
  const search = () =>
    ldapSearch<AdUserRef>(
      config,
      config.baseDn,
      "(&(objectClass=user)(objectCategory=person))",
      [
        "distinguishedName",
        "mail",
        "userPrincipalName",
        "givenName",
        "sn",
        "displayName",
        "sAMAccountName",
      ],
      500,
    );

  try {
    return await search();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("destroyed")) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return search();
  }
}

export function countUsersInOuCached(users: AdUserRef[], ouDn: string): number {
  return users.filter((user) => user.distinguishedName && userBelongsToOu(user.distinguishedName, ouDn))
    .length;
}

/** Все OU для регистрации (кроме служебных и контейнера «Коммерческие отделы») */
export async function listRegistrationOUs(config: AdConfig): Promise<AdOu[]> {
  const skip = getSkipOus();

  const allOus = await ldapSearch<{ distinguishedName?: string; ou?: string }>(
    config,
    config.baseDn,
    "(objectClass=organizationalUnit)",
    ["ou", "distinguishedName"],
    300,
  );

  return mapOuRows(allOus).filter(
    (ou) => !skip.has(ou.name) && ou.name !== COMMERCIAL_PARENT_OU,
  );
}

export async function listAdOrganizationalUnits(
  config: AdConfig,
  scope: "registration" | "all" = "registration",
): Promise<AdOu[]> {
  if (scope === "all") {
    const rows = await ldapSearch<{ distinguishedName?: string; ou?: string }>(
      config,
      config.baseDn,
      "(objectClass=organizationalUnit)",
      ["ou", "distinguishedName"],
      300,
    );
    return mapOuRows(rows);
  }
  return listRegistrationOUs(config);
}

/** Для коммерческих отделов сотрудники создаются в OU=Сотрудники */
export async function resolveAdUsersOu(config: AdConfig, departmentOu: string): Promise<string> {
  const childSuffix = `,${departmentOu.toLowerCase()}`;
  try {
    const rows = await ldapSearch<{ distinguishedName?: string; ou?: string }>(
      config,
      config.baseDn,
      "(&(objectClass=organizationalUnit)(ou=Сотрудники))",
      ["distinguishedName", "ou"],
      300,
    );
    const match = rows.find((row) =>
      (row.distinguishedName ?? "").toLowerCase().endsWith(childSuffix),
    );
    if (match?.distinguishedName) return match.distinguishedName;
  } catch {
    // ignore
  }
  return departmentOu;
}

export async function adEmailExists(config: AdConfig, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const login = loginFromEmail(normalized);
  const upn = adUpnFromLogin(login);
  const filter = `(|(mail=${escapeLdap(normalized)})(userPrincipalName=${escapeLdap(normalized)})(userPrincipalName=${escapeLdap(upn)})(sAMAccountName=${escapeLdap(login)}))`;
  const rows = await ldapSearch(config, config.baseDn, filter, ["distinguishedName"], 1);
  return rows.length > 0;
}

function buildSamAccountName(email: string): string {
  return samAccountNameFromEmail(email);
}

function buildCn(firstName: string, lastName: string, middleName?: string): string {
  return [lastName, firstName, middleName].filter(Boolean).join(" ").trim();
}

/** CN в DN должен быть ASCII — LDAP на :9389 не принимает кириллицу в distinguishedName */
function buildCnForDn(firstName: string, lastName: string, middleName?: string): string {
  const cn = buildCn(firstName, lastName, middleName);
  if (/^[\x20-\x7E]+$/.test(cn)) return cn;
  return toLatinAscii(cn);
}

export async function createAdUser(
  config: AdConfig,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    position?: string;
    ouDn: string;
    adGroupDn?: string | null;
    password?: string;
  },
  dryRun: boolean,
): Promise<{ ok: true; samAccountName: string; dn: string; note?: string; adGroup?: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const samAccountName = buildSamAccountName(email);
  const workEmail = canonicalNovactivEmail(samAccountName);
  const upn = adUpnFromLogin(samAccountName);
  const displayName = buildCn(input.firstName, input.lastName, input.middleName);
  const cnForDn = buildCnForDn(input.firstName, input.lastName, input.middleName);
  const userDn = buildAdUserDn(cnForDn);
  const dn = userDn.toString();
  const targetOu = input.ouDn;
  const adGroupDn = input.adGroupDn ?? resolveAdGroupDn(targetOu);

  if (dryRun) {
    return {
      ok: true,
      samAccountName,
      dn: `CN=${displayName},${targetOu}`,
      adGroup: adGroupDn ?? undefined,
      note: "[Dry-run] Учётка AD не создана (будет включена автоматически)",
    };
  }

  try {
    await ldapAdd(config, userDn, {
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn: cnForDn,
      sn: input.lastName,
      givenName: input.firstName,
      ...(input.middleName ? { middleName: input.middleName } : {}),
      displayName,
      name: displayName,
      sAMAccountName: samAccountName,
      userPrincipalName: upn,
      mail: workEmail,
      ...(input.position ? { title: input.position } : {}),
      userAccountControl: "546",
      description: `Создано Novactiv Access Panel. Целевой OU: ${targetOu}`,
    });

    const activateResult = await activateAdUser(
      config,
      { samAccountName, password: input.password },
      false,
    );
    if (!activateResult.ok) {
      return {
        ok: false,
        error: `Учётка AD создана, но не удалось включить: ${activateResult.error}`,
      };
    }

    let finalDn = dn;
    let moveNote = "";

    const needsMove = !targetOu.toLowerCase().includes("cn=users");
    if (needsMove) {
      if (cnForDn !== displayName) {
        try {
          await ldapRenameUser(config, dn, displayName);
          finalDn = `CN=${displayName},${USERS_CONTAINER_DN}`;
        } catch {
          // оставляем латинский CN
        }
      }

      const moveResult = await moveAdUserToOu(
        config,
        { samAccountName, cn: displayName, targetOuDn: targetOu },
        false,
      );
      if (moveResult.ok) {
        finalDn = moveResult.dn;
        moveNote = moveResult.skipped ? "" : " Перенесён в целевой OU.";
      } else {
        moveNote = ` Перенос в OU не выполнен: ${moveResult.error}`;
      }
    }

    let groupNote = "";
    if (adGroupDn) {
      const groupResult = await addAdGroupMember(config, adGroupDn, finalDn);
      if (groupResult.ok) {
        const groupName = adGroupDn.match(/CN=([^,]+)/)?.[1] ?? adGroupDn;
        groupNote = ` Добавлен в группу ${groupName}.`;
      } else {
        groupNote = ` Группа не назначена: ${groupResult.error}`;
      }
    }

    const activateNote = activateResult.passwordSet
      ? " Учётка включена, пароль установлен."
      : " Учётка включена.";

    return {
      ok: true,
      samAccountName,
      dn: finalDn,
      adGroup: adGroupDn ?? undefined,
      note: `Учётка AD создана.${activateNote}${moveNote}${groupNote}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка AD";
    if (message.includes("Already Exists") || message.includes("ENTRY_ALREADY_EXISTS")) {
      return { ok: false, error: "Пользователь с таким именем уже есть в AD" };
    }
    return { ok: false, error: message };
  }
}
