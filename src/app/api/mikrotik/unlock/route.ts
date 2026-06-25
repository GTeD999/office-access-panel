import { NextRequest, NextResponse } from "next/server";
import {
  buildMikrotikGateCookieValue,
  isMikrotikGateRequired,
  MIKROTIK_GATE_COOKIE,
  mikrotikGateCookieOptions,
  verifyMikrotikGateSecret,
} from "@/lib/mikrotik-gate";

export async function POST(request: NextRequest) {
  if (!isMikrotikGateRequired()) {
    return NextResponse.json({
      ok: true,
      message: "MIKROTIK_GATE_SECRET не задан — доступ открыт",
    });
  }

  let body: { secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!verifyMikrotikGateSecret(secret)) {
    return NextResponse.json(
      { ok: false, message: "Неверная фраза для MikroTik" },
      { status: 401 },
    );
  }

  const value = await buildMikrotikGateCookieValue();
  if (!value) {
    return NextResponse.json({ ok: false, message: "Ошибка сессии" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, message: "Доступ к MikroTik разрешён" });
  response.cookies.set(MIKROTIK_GATE_COOKIE, value, mikrotikGateCookieOptions());
  return response;
}
