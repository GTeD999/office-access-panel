import type { MikrotikConfig } from "./mikrotik";
import { isRouterPriorityActive, runWithRouterPriority } from "./router-busy";
import { syncGeoCountryWhitelist, isGeoSyncRunning } from "./geo-country-sync";
import { ensureRouterDdnsWhitelistSync } from "./mikrotik-ddns-sync";
import { ensureRouterMgmtLock } from "./mikrotik-mgmt-lock";
import { syncPanelWhitelist } from "./panel-ip";

const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

let maintenanceRunning = false;
let lastMaintenanceAt = 0;

export function isRouterBusy(): boolean {
  return isRouterPriorityActive() || maintenanceRunning || isGeoSyncRunning();
}

/** Блокирует фоновую синхронизацию на время вкл/выкл интернета. */
export async function withRouterPriority<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRouterPriority(fn);
}

/**
 * Whitelist IP / geo / mgmt-lock — только на роутере, в фоне, не блокирует /api/status.
 */
export function scheduleRouterMaintenance(
  config: MikrotikConfig,
  clientIp?: string | null,
): void {
  if (isRouterPriorityActive() || maintenanceRunning || isGeoSyncRunning()) return;
  if (Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;

  maintenanceRunning = true;
  void (async () => {
    try {
      await syncPanelWhitelist({ clientIp }).catch(() => undefined);
      await syncGeoCountryWhitelist(config, false).catch(() => undefined);
      await ensureRouterDdnsWhitelistSync(config, false).catch(() => undefined);
      await ensureRouterMgmtLock(config, false).catch(() => undefined);
      lastMaintenanceAt = Date.now();
    } finally {
      maintenanceRunning = false;
    }
  })();
}
