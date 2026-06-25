import { NextRequest, NextResponse } from "next/server";
import { verifyAccessSecret } from "@/lib/access-auth";
import { resolveClientPublicIp, syncPanelWhitelist } from "@/lib/panel-ip";
import { ensureRouterDdnsWhitelistSync } from "@/lib/mikrotik-ddns-sync";
import { getMikrotikConfig } from "@/lib/config";

/**
 * Регистрирует ваш текущий IP в whitelist роутера.
 * Вызовите после смены IP, если панель ещё доступна:
 * curl -X POST https://ваша-панель/api/whitelist/ping -H 'Content-Type: application/json' -d '{"secret":"..."}'
 */
export async function POST(request: NextRequest) {
  let body: { secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Некорректный JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!verifyAccessSecret(secret)) {
    return NextResponse.json({ ok: false, message: "Неверная секретная фраза" }, { status: 401 });
  }

  const clientIp = resolveClientPublicIp(request);
  const result = await syncPanelWhitelist({ clientIp });

  const config = getMikrotikConfig();
  if (config?.allowWrite && !config.dryRun) {
    await ensureRouterDdnsWhitelistSync(config, false).catch(() => undefined);
  }

  return NextResponse.json({
    ok: result.synced,
    message: result.synced
      ? `IP зарегистрирован: ${result.ips.join(", ")} (действуют ${process.env.PANEL_WHITELIST_TIMEOUT || "3d"})`
      : result.error ?? "Не удалось обновить whitelist",
    ips: result.ips,
    clientIp,
  });
}
