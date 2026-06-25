import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import {
  getRegruStatus,
  toggleAllRegru,
  toggleRegruHostingSite,
  toggleRegruService,
} from "@/lib/regru";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET() {
  const status = await getRegruStatus();
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  let body: { action?: unknown; serviceId?: unknown; domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (body.action === "off" || body.action === "on") {
    const result = await toggleAllRegru(body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (
    (body.action === "site-off" || body.action === "site-on") &&
    typeof body.serviceId === "string" &&
    typeof body.domain === "string"
  ) {
    const result = await toggleRegruHostingSite(
      body.serviceId,
      body.domain,
      body.action === "site-off" ? "off" : "on",
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (
    (body.action === "suspend" || body.action === "resume") &&
    typeof body.serviceId === "string"
  ) {
    const result = await toggleRegruService(body.serviceId, body.action);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      message:
        "action: site-off | site-on (serviceId + domain) | suspend | resume | off | on",
    },
    { status: 400 },
  );
}
