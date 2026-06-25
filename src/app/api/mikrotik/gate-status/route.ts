import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isMikrotikGateRequired,
  MIKROTIK_GATE_COOKIE,
  verifyMikrotikGateCookie,
} from "@/lib/mikrotik-gate";

export async function GET() {
  if (!isMikrotikGateRequired()) {
    return NextResponse.json({ required: false, unlocked: true });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(MIKROTIK_GATE_COOKIE)?.value;
  const unlocked = await verifyMikrotikGateCookie(token);

  return NextResponse.json({ required: true, unlocked });
}
