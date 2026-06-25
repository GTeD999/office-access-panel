/** Логин = часть email до @ (serebryakov@novactiv.ru → serebryakov). Одинаково для AD и cloud. */
export function loginFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return local.replace(/[^a-z0-9._-]/g, "");
}

/** AD sAMAccountName — до 20 символов */
export function samAccountNameFromEmail(email: string): string {
  const login = loginFromEmail(email);
  return login.slice(0, 20) || "user";
}

export function isNovactivEmail(email: string): boolean {
  return /@novactiv\.(ru|com)$/i.test(email.trim());
}

/** Рабочий email для UI и регистрации — всегда @novactiv.ru */
export function canonicalNovactivEmail(emailOrLogin: string): string {
  const login = emailOrLogin.includes("@")
    ? loginFromEmail(emailOrLogin)
    : emailOrLogin.trim().toLowerCase();
  return `${login}@novactiv.ru`;
}

/** UPN в AD — домен novactiv.com (как создаёт Active Directory) */
export function adUpnFromLogin(login: string): string {
  const domain = process.env.AD_UPN_DOMAIN ?? "example.com";
  return `${login.trim().toLowerCase()}@${domain}`;
}

export function emailsShareLogin(a: string, b: string): boolean {
  return loginFromEmail(a) === loginFromEmail(b);
}
