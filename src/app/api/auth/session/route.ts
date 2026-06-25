import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  isAuthRequired,
  verifySessionCookie,
} from "@/lib/access-auth";

export async function GET() {
  if (!isAuthRequired()) {
    return NextResponse.json({ authenticated: true, required: false });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const authenticated = await verifySessionCookie(token);

  return NextResponse.json({ authenticated, required: true });
}
