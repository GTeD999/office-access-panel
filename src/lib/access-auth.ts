const COOKIE_NAME = "office_access";
const SESSION_VERSION = "v1";

function sessionDays(): number {
  const fromEnv = Number(process.env.ACCESS_SESSION_DAYS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 90;
}

/** Длинная секретная фраза. APP_PIN — устаревший алиас. */
export function getAccessSecret(): string | null {
  const secret =
    process.env.ACCESS_SECRET?.trim() || process.env.APP_PIN?.trim() || "";
  return secret || null;
}

export function isAuthRequired(): boolean {
  if (process.env.PANEL_LOCAL_ONLY === "true") return false;
  return getAccessSecret() !== null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function verifyAccessSecret(candidate: string): boolean {
  const secret = getAccessSecret();
  if (!secret) return true;
  return timingSafeEqualStr(candidate, secret);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signPayload(payload: string): Promise<string> {
  const secret = getAccessSecret();
  if (!secret) return "";

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64url(new Uint8Array(sig));
}

export async function buildSessionCookieValue(): Promise<string | null> {
  const secret = getAccessSecret();
  if (!secret) return null;

  const exp = Date.now() + sessionDays() * 24 * 60 * 60 * 1000;
  const payload = `${SESSION_VERSION}:${exp}`;
  const sig = await signPayload(payload);
  return `${payload}:${sig}`;
}

export async function verifySessionCookie(value: string | undefined): Promise<boolean> {
  if (!isAuthRequired()) return true;
  if (!value) return false;

  const parts = value.split(":");
  if (parts.length < 3) return false;

  const sig = parts.pop()!;
  const payload = parts.join(":");
  const expected = await signPayload(payload);
  if (!expected) return false;
  if (!timingSafeEqualStr(sig, expected)) return false;

  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  return parts[0] === SESSION_VERSION;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionDays() * 24 * 60 * 60,
  };
}

export { COOKIE_NAME };
