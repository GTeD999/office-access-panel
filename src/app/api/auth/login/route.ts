import { NextRequest, NextResponse } from "next/server";
import {
  buildSessionCookieValue,
  sessionCookieOptions,
  verifyAccessSecret,
  isAuthRequired,
  COOKIE_NAME,
} from "@/lib/access-auth";
import { resolveClientPublicIp, syncPanelWhitelist } from "@/lib/panel-ip";
import { ensureRouterDdnsWhitelistSync } from "@/lib/mikrotik-ddns-sync";
import { getMikrotikConfig } from "@/lib/config";

export async function POST(request: NextRequest) {
  if (!isAuthRequired()) {
    return NextResponse.json({
      ok: true,
      message: "ACCESS_SECRET не задан — вход не требуется",
    });
  }

  let body: { secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!verifyAccessSecret(secret)) {
    return NextResponse.json(
      { ok: false, message: "Неверная секретная фраза" },
      { status: 401 },
    );
  }

  const value = await buildSessionCookieValue();
  if (!value) {
    return NextResponse.json({ ok: false, message: "Ошибка сессии" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, message: "Вход выполнен" });
  const options = sessionCookieOptions();
  response.cookies.set(COOKIE_NAME, value, options);

  const clientIp = resolveClientPublicIp(request);
  await syncPanelWhitelist({ clientIp }).catch(() => undefined);
  const mikrotik = getMikrotikConfig();
  if (mikrotik?.allowWrite && !mikrotik.dryRun) {
    await ensureRouterDdnsWhitelistSync(mikrotik, false).catch(() => undefined);
  }

  return response;
}
