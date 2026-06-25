import { getMikrotikConfig, getMgmtAllowCountries } from "./config";
import { scheduleRouterMaintenance, withRouterPriority } from "./router-maintenance";
import { syncPanelWhitelist } from "./panel-ip";
import {
  getMgmtLockStatus,
} from "./mikrotik-mgmt-lock";
import {
  createInternetOffRule,
  ensureForwardBlockOrder,
  ensureInternetOffRuleShape,
  findCameraNatRules,
  findInternetExemptRules,
  findInternetOffRule,
  findProtectedNatRules,
  getFirewallRules,
  getNatRules,
  getSystemResource,
  maintainProtectedAccessWhileBlocked,
  restoreOfficeInternet,
  restoreProtectedNatRules,
  setInternetExemptRulesEnabled,
  setInternetOffRuleEnabled,
  setOfficeNatLock,
  verifyRouterReachable,
  MikrotikError,
} from "./mikrotik";

export type InternetStatus = "on" | "off" | "unknown";
export type RuleStatus = "not_configured" | "ready" | "active";

export type DashboardStatus = {
  connected: boolean;
  error?: string;
  router?: {
    boardName: string;
    version: string;
    uptime: string;
    cpuLoad: number;
    memoryUsedPercent: number;
  };
  internet: {
    status: InternetStatus;
    ruleStatus: RuleStatus;
    ruleId?: string;
  };
  cameras: {
    externalAccess: "open" | "blocked" | "partial" | "unknown";
    natRulesTotal: number;
    natRulesBlocked: number;
  };
  safety: {
    dryRun: boolean;
    allowWrite: boolean;
  };
  mgmtLock: {
    configured: boolean;
    active: boolean;
    geoCountries?: string[];
    geoCidrCount?: number;
  };
};

function parseMemoryPercent(free: string, total: string): number {
  const freeMem = Number(free);
  const totalMem = Number(total);
  if (!totalMem) return 0;
  return Math.round(((totalMem - freeMem) / totalMem) * 100);
}

export async function getDashboardStatus(options?: {
  clientIp?: string | null;
}): Promise<DashboardStatus> {
  const config = getMikrotikConfig();

  if (!config) {
    return {
      connected: false,
      error: "Не заданы переменные MIKROTIK_HOST, MIKROTIK_USERNAME, MIKROTIK_PASSWORD",
      internet: { status: "unknown", ruleStatus: "not_configured" },
      cameras: { externalAccess: "unknown", natRulesTotal: 0, natRulesBlocked: 0 },
      safety: { dryRun: true, allowWrite: false },
      mgmtLock: { configured: false, active: false },
    };
  }

  try {
    const [resource, rulesInitial, natRules] = await Promise.all([
      getSystemResource(config),
      getFirewallRules(config),
      getNatRules(config),
    ]);
    const rules = rulesInitial;

    const rule = findInternetOffRule(rules);
    let cameraNatRules = findCameraNatRules(natRules);
    let blockedCameraNats = cameraNatRules.filter((r) => r.disabled === "true");
    let ruleStatus: RuleStatus = "not_configured";
    let internetStatus: InternetStatus = "on";

    if (rule) {
      const isBlocking = rule.disabled === "false";
      ruleStatus = isBlocking ? "active" : "ready";
      internetStatus = isBlocking ? "off" : "on";

      const exemptRules = findInternetExemptRules(rules);
      const exemptDisabled = exemptRules.some((r) => r.disabled === "true");
      const exemptMissingHypervisor = !exemptRules.some((r) =>
        (r.comment ?? "").includes("192.168.88.20"),
      );
      const protectedBlocked = findProtectedNatRules(natRules).some(
        (r) => r.disabled === "true" || (r.comment ?? "").includes("office:locked"),
      );

      if (
        isBlocking &&
        (blockedCameraNats.length > 0 ||
          exemptDisabled ||
          exemptMissingHypervisor ||
          protectedBlocked) &&
        config.allowWrite &&
        !config.dryRun
      ) {
        void maintainProtectedAccessWhileBlocked(config, false)
          .then(() => ensureForwardBlockOrder(config, false))
          .then(() => getNatRules(config))
          .catch(() => undefined);
      }
    }

    if (config.allowWrite && !config.dryRun) {
      scheduleRouterMaintenance(config, options?.clientIp);
    }

    const mgmtLock = getMgmtLockStatus(rules);
    const geoCountries = getMgmtAllowCountries();

    return {
      connected: true,
      router: {
        boardName: resource["board-name"],
        version: resource.version,
        uptime: resource.uptime,
        cpuLoad: Number(resource["cpu-load"]) || 0,
        memoryUsedPercent: parseMemoryPercent(
          resource["free-memory"],
          resource["total-memory"],
        ),
      },
      internet: {
        status: internetStatus,
        ruleStatus,
        ruleId: rule?.[".id"],
      },
      cameras: {
        externalAccess:
          cameraNatRules.length === 0
            ? "unknown"
            : blockedCameraNats.length === cameraNatRules.length
              ? "blocked"
              : blockedCameraNats.length === 0
                ? "open"
                : "partial",
        natRulesTotal: cameraNatRules.length,
        natRulesBlocked: blockedCameraNats.length,
      },
      safety: {
        dryRun: config.dryRun,
        allowWrite: config.allowWrite,
      },
      mgmtLock: {
        configured: mgmtLock.configured,
        active: mgmtLock.active,
        geoCountries,
      },
    };
  } catch (error) {
    const message =
      error instanceof MikrotikError
        ? error.status === 401
          ? "Неверный логин или пароль. Проверьте MIKROTIK_USERNAME и MIKROTIK_PASSWORD в .env.local (спецсимволы — в одинарных кавычках)."
          : `Ошибка MikroTik (${error.status}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Неизвестная ошибка";

    return {
      connected: false,
      error: message,
      internet: { status: "unknown", ruleStatus: "not_configured" },
      cameras: { externalAccess: "unknown", natRulesTotal: 0, natRulesBlocked: 0 },
      safety: {
        dryRun: config.dryRun,
        allowWrite: config.allowWrite,
      },
      mgmtLock: { configured: false, active: false },
    };
  }
}

export type ToggleResult = {
  ok: boolean;
  message: string;
  internetStatus: InternetStatus;
  dryRun: boolean;
};

export async function toggleInternet(
  action: "on" | "off" | "setup",
  options?: { clientIp?: string | null },
): Promise<ToggleResult> {
  const config = getMikrotikConfig();

  if (!config) {
    return {
      ok: false,
      message: "MikroTik не настроен",
      internetStatus: "unknown",
      dryRun: true,
    };
  }

  if (!config.allowWrite) {
    return {
      ok: false,
      message:
        "Запись отключена (MIKROTIK_ALLOW_WRITE=false). Это защита — интернет не трогаем.",
      internetStatus: "unknown",
      dryRun: config.dryRun,
    };
  }

  try {
    const toggleResult = await withRouterPriority(async (): Promise<ToggleResult> => {
      const rules = await getFirewallRules(config);
      const rule = findInternetOffRule(rules);

      if (action === "setup") {
        if (rule) {
          await ensureInternetOffRuleShape(config, rule[".id"], config.dryRun);
          return {
            ok: true,
            message: config.dryRun
              ? "[Dry-run] Правило уже существует"
              : "Правило обновлено и готово (офис не затронут)",
            internetStatus: rule.disabled === "false" ? "off" : "on",
            dryRun: config.dryRun,
          };
        }

        const result = await createInternetOffRule(config, config.dryRun);
        return {
          ok: true,
          message: result.dryRun
            ? "[Dry-run] Правило было бы создано в disabled-состоянии"
            : "Правило создано (интернет не затронут)",
          internetStatus: "on",
          dryRun: result.dryRun,
        };
      }

      if (!rule) {
        return {
          ok: false,
          message: "Сначала создайте правило (кнопка «Подготовить»)",
          internetStatus: "on",
          dryRun: config.dryRun,
        };
      }

      const blockInternet = action === "off";
      const result = await setInternetOffRuleEnabled(
        config,
        rule[".id"],
        blockInternet,
        config.dryRun,
      );

      let natUpdated = 0;
      let protectedNatUpdated = 0;

      if (blockInternet) {
        const protectedNatResult = await maintainProtectedAccessWhileBlocked(
          config,
          config.dryRun,
        );
        const natResult = await setOfficeNatLock(config, true, config.dryRun);
        const repairResult = await maintainProtectedAccessWhileBlocked(
          config,
          config.dryRun,
        );
        natUpdated = natResult.updated;
        protectedNatUpdated = protectedNatResult.updated + repairResult.updated;
      } else {
        const restoreResult = await restoreOfficeInternet(config, config.dryRun);
        natUpdated = restoreResult.updated;
      }

      if (!result.dryRun && blockInternet) {
        const reachable = await verifyRouterReachable(config);
        if (!reachable) {
          await setInternetOffRuleEnabled(config, rule[".id"], false, false);
          await setOfficeNatLock(config, false, false);
          await setInternetExemptRulesEnabled(config, false, false);
          await restoreProtectedNatRules(config, false);
          return {
            ok: false,
            message:
              "Связь с роутером потеряна — всё автоматически восстановлено.",
            internetStatus: "on",
            dryRun: false,
          };
        }
      }

      const natNote = result.dryRun
        ? ""
        : blockInternet
          ? ` Прочие пробросы отключены (${natUpdated}), камеры и гипервизор сохранены (${protectedNatUpdated}).`
          : ` Пробросы и исключения восстановлены (${natUpdated}).`;

      return {
        ok: true,
        message: result.dryRun
          ? `[Dry-run] Офис был бы ${blockInternet ? "заблокирован" : "разблокирован"}`
          : blockInternet
            ? `Интернет в офисе отключён, вход снаружи закрыт (кроме камер).${natNote} Управление роутером работает.`
            : `Офис разблокирован: интернет и сервисы восстановлены.${natNote}`,
        internetStatus: blockInternet ? "off" : "on",
        dryRun: result.dryRun,
      };
    });

    if (!config.dryRun && config.allowWrite) {
      void syncPanelWhitelist({ clientIp: options?.clientIp }).catch(() => undefined);
      scheduleRouterMaintenance(config, options?.clientIp);
    }

    return toggleResult;
  } catch (error) {
    const message =
      error instanceof MikrotikError
        ? `Ошибка MikroTik (${error.status}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Неизвестная ошибка";

    return { ok: false, message, internetStatus: "unknown", dryRun: config.dryRun };
  }
}
