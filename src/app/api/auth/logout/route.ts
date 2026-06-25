import { NextResponse } from "next/server";
import { COOKIE_NAME, sessionCookieOptions } from "@/lib/access-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Выход выполнен" });
  const options = sessionCookieOptions();
  response.cookies.set(COOKIE_NAME, "", { ...options, maxAge: 0 });
  return response;
}
