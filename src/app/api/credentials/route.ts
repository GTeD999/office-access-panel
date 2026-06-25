import { NextRequest, NextResponse } from "next/server";
import { getCredentialsStore } from "@/lib/credentials";
import { getAppPin } from "@/lib/config";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  const store = await getCredentialsStore();
  if (!store) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Файл .data/credentials.json не найден. Скопируйте credentials.example.json и заполните.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...store });
}
