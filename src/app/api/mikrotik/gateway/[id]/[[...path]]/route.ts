import { NextRequest, NextResponse } from "next/server";
import { getMikrotikOpenTarget, proxyToMikrotik } from "@/lib/mikrotik-open";
import {
  isMikrotikGateRequired,
  MIKROTIK_GATE_COOKIE,
  verifyMikrotikGateCookie,
} from "@/lib/mikrotik-gate";

type Params = { id: string; path?: string[] };

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  return handleGateway(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  return handleGateway(request, context);
}

export async function HEAD(request: NextRequest, context: { params: Promise<Params> }) {
  return handleGateway(request, context);
}

async function handleGateway(request: NextRequest, context: { params: Promise<Params> }) {
  if (isMikrotikGateRequired()) {
    const token = request.cookies.get(MIKROTIK_GATE_COOKIE)?.value;
    const unlocked = await verifyMikrotikGateCookie(token);
    if (!unlocked) {
      const returnUrl = request.nextUrl.pathname + request.nextUrl.search;
      const unlock = new URL("/mikrotik-unlock", request.url);
      unlock.searchParams.set("return", returnUrl);
      const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");
      if (acceptsHtml || request.method === "GET") {
        return NextResponse.redirect(unlock);
      }
      return NextResponse.json(
        { error: "Требуется фраза MikroTik. Откройте /mikrotik-unlock" },
        { status: 401 },
      );
    }
  }

  const { id, path } = await context.params;
  const target = await getMikrotikOpenTarget(id);

  if (!target) {
    return NextResponse.json(
      { error: "Роутер не найден или не указан url/host в credentials.json" },
      { status: 404 },
    );
  }

  try {
    const subPath = path?.join("/") ?? "";
    return await proxyToMikrotik(target, subPath, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка подключения к роутеру";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
