import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import {
  getRegvpsStatus,
  toggleRegvps,
  toggleSingleReglet,
} from "@/lib/regvps";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET() {
  const status = await getRegvpsStatus();
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  let body: { action?: unknown; regletId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (body.action === "off" || body.action === "on") {
    const result = await toggleRegvps(body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (
    (body.action === "start" || body.action === "stop" || body.action === "reboot") &&
    typeof body.regletId === "number"
  ) {
    const result = await toggleSingleReglet(body.regletId, body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      message: "action: off | on | start | stop | reboot (с regletId для одиночного)",
    },
    { status: 400 },
  );
}
