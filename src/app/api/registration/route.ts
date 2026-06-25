import { NextRequest, NextResponse } from "next/server";
import { getAppPin } from "@/lib/config";
import {
  checkRegistrationEmail,
  getEmployeeCredentials,
  getEmployeeList,
  getRegistrationStatus,
  registerEmployee,
  syncEmployeeServices,
} from "@/lib/registration";
import type { RegistrationInput } from "@/lib/registration/types";

export const dynamic = "force-dynamic";

function checkPin(request: NextRequest): boolean {
  const appPin = getAppPin();
  if (!appPin) return true;
  return request.headers.get("x-app-pin") === appPin;
}

export async function GET(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("list") === "employees") {
    const list = await getEmployeeList();
    return NextResponse.json(list, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  const credentialsLogin = url.searchParams.get("credentials");
  if (credentialsLogin) {
    const credentials = await getEmployeeCredentials(credentialsLogin);
    if (!credentials) {
      return NextResponse.json({ ok: false, message: "Данные не найдены" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, credentials }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  const status = await getRegistrationStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function POST(request: NextRequest) {
  if (!checkPin(request)) {
    return NextResponse.json({ ok: false, message: "Неверный PIN" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  if (body.action === "check-email") {
    const email = typeof body.email === "string" ? body.email : "";
    const result = await checkRegistrationEmail(email);
    return NextResponse.json(result);
  }

  const input: RegistrationInput = {
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    firstName: typeof body.firstName === "string" ? body.firstName : "",
    lastName: typeof body.lastName === "string" ? body.lastName : "",
    middleName: typeof body.middleName === "string" ? body.middleName : undefined,
    birthDate: typeof body.birthDate === "string" ? body.birthDate : undefined,
    position: typeof body.position === "string" ? body.position : undefined,
    departmentId: typeof body.departmentId === "string" ? body.departmentId : "",
    bitrixDepartmentId:
      typeof body.bitrixDepartmentId === "number"
        ? body.bitrixDepartmentId
        : typeof body.bitrixDepartmentId === "string" && body.bitrixDepartmentId
          ? Number(body.bitrixDepartmentId)
          : undefined,
    createYandex: body.createYandex !== false,
    createAd: body.createAd !== false,
    createBitrix: body.createBitrix !== false,
    createFolder: body.createFolder === true,
    passwordChangeRequired: body.passwordChangeRequired !== false,
  };

  const registerFn = body.action === "sync-services" ? syncEmployeeServices : registerEmployee;
  const result = await registerFn(input);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
