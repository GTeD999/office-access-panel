import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import { toggleInternet } from "@/lib/internet-switch";
import { resolveClientPublicIp } from "@/lib/panel-ip";

type Action = "on" | "off" | "setup";

function isAction(value: unknown): value is Action {
  return value === "on" || value === "off" || value === "setup";
}

export async function POST(request: NextRequest) {
  const appPin = getAppPin();
  if (appPin) {
    const pin = request.headers.get("x-app-pin");
    if (pin !== appPin) {
      return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
    }
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (!isAction(body.action)) {
    return NextResponse.json(
      { ok: false, message: "action должен быть: on, off или setup" },
      { status: 400 },
    );
  }

  const clientIp = resolveClientPublicIp(request);
  const result = await toggleInternet(body.action, { clientIp });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
