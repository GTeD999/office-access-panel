import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import { getVmwareStatus, toggleAllVms, toggleVm } from "@/lib/vmware";

export const dynamic = "force-dynamic";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET() {
  const status = await getVmwareStatus();
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  let body: { action?: unknown; vmId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (body.action === "off" || body.action === "on") {
    const result = await toggleAllVms(body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (
    (body.action === "start" || body.action === "stop") &&
    typeof body.vmId === "string"
  ) {
    const result = await toggleVm(body.vmId, body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json(
    { ok: false, message: "action: off | on | start | stop (с vmId для одной VM)" },
    { status: 400 },
  );
}
