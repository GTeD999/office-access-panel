import { getAccountsConfig } from "./config";
import { getAvitoAccountStatus } from "./avito";
import { getCianAccountStatus } from "./cian";
import {
  generatePassword,
  getYandex360Status,
  yandexLogoutAllSessions,
  yandexResetPassword,
  yandexSetUserEnabled,
  yandexToggleAllUsers,
} from "./yandex360";
import type { AccountActionResult, AccountsStatus, YandexMailUser } from "./types";

export type { AccountsStatus, AccountActionResult } from "./types";

export async function getAccountsStatus(): Promise<AccountsStatus> {
  const config = await getAccountsConfig();
  const dryRun = process.env.ACCOUNTS_DRY_RUN !== "false";

  const [avito, cian, yandex360] = await Promise.all([
    Promise.all((config.avito ?? []).map(getAvitoAccountStatus)),
    Promise.all((config.cian ?? []).map(getCianAccountStatus)),
    getYandex360Status(config.yandex360?.orgId, config.yandex360?.oauthToken),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    dryRun,
    avito,
    cian,
    yandex360,
  };
}

function findYandexUser(
  users: YandexMailUser[],
  userId: string,
): YandexMailUser | undefined {
  return users.find((user) => user.id === userId);
}

export async function runAccountAction(body: {
  provider?: unknown;
  action?: unknown;
  accountId?: unknown;
  userId?: unknown;
  password?: unknown;
  passwordChangeRequired?: unknown;
  enabled?: unknown;
}): Promise<AccountActionResult> {
  const config = await getAccountsConfig();

  if (body.provider === "yandex360") {
    const orgId = config.yandex360?.orgId;
    const token = config.yandex360?.oauthToken;
    if (!orgId || !token) {
      return { ok: false, message: "Yandex 360 не настроен", dryRun: true };
    }

    if (body.action === "bulk-off" || body.action === "bulk-on") {
      return yandexToggleAllUsers(
        orgId,
        token,
        body.action === "bulk-off" ? "off" : "on",
      );
    }

    const userId = typeof body.userId === "string" ? body.userId : null;
    if (!userId) {
      return { ok: false, message: "Нужен userId", dryRun: true };
    }

    const status = await getYandex360Status(orgId, token);
    const user = findYandexUser(status.users, userId);

    if (body.action === "reset-password") {
      const password =
        typeof body.password === "string" && body.password.trim()
          ? body.password.trim()
          : generatePassword();
      const passwordChangeRequired = body.passwordChangeRequired !== false;
      return yandexResetPassword(
        orgId,
        token,
        userId,
        password,
        user,
        passwordChangeRequired,
      );
    }

    if (body.action === "disable" || body.action === "enable") {
      return yandexSetUserEnabled(
        orgId,
        token,
        userId,
        body.action === "enable",
        user,
      );
    }

    if (body.action === "logout-all-devices") {
      return yandexLogoutAllSessions(orgId, token, userId, user);
    }

    return {
      ok: false,
      message:
        "action: reset-password | disable | enable | logout-all-devices | bulk-off | bulk-on",
      dryRun: true,
    };
  }

  if (body.provider === "avito" || body.provider === "cian") {
    return {
      ok: true,
      message:
        "Откройте «Сменить пароль» или «Выйти везде» на карточке аккаунта — API для этого не нужен.",
      dryRun: false,
    };
  }

  return { ok: false, message: "provider: yandex360 | avito | cian", dryRun: true };
}
