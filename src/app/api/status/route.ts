import { NextRequest, NextResponse } from "next/server";
import { getDashboardStatus } from "@/lib/internet-switch";
import { resolveClientPublicIp } from "@/lib/panel-ip";

export async function GET(request: NextRequest) {
  const clientIp = resolveClientPublicIp(request);
  const status = await getDashboardStatus({ clientIp });
  return NextResponse.json(status);
}
