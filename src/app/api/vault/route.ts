import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import { getVaultStore } from "@/lib/vault";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  const store = await getVaultStore();
  if (!store) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Файл .data/vault.json не найден. Импортируйте экспорт: node scripts/import-vault-tsv.mjs путь/к/export.tsv",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, ...store });
}
