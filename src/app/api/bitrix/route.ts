import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import { getBitrixStatus, toggleBitrixAccess } from "@/lib/bitrix";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET() {
  const status = await getBitrixStatus();
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (body.action !== "open" && body.action !== "close") {
    return NextResponse.json(
      { ok: false, message: "action должен быть: open или close" },
      { status: 400 },
    );
  }

  const result = await toggleBitrixAccess(body.action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
