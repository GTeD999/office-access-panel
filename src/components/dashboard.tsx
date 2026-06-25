"use client";

import AccountsPanel from "@/components/accounts-panel";
import CredentialsPanel from "@/components/credentials-panel";
import EmployeesPanel from "@/components/employees-panel";
import VaultPanel from "@/components/vault-panel";
import RegruPanel from "@/components/regru-panel";
import RemoteDesktopPanel from "@/components/remote-desktop-panel";
import VmwarePanel from "@/components/vmware-panel";
import type { BitrixStatus } from "@/lib/bitrix";
import type { DashboardStatus } from "@/lib/internet-switch";
import type { RegruStatus } from "@/lib/regru";
import type { VmwareStatus } from "@/lib/vmware";
import {
  Activity,
  Briefcase,
  Cpu,
  Globe,
  GlobeLock,
  HardDrive,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Monitor,
  Power,
  RefreshCw,
  Router,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Users,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type AppTab = "control" | "credentials" | "vault" | "accounts" | "employees" | "screens";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center gap-2 text-[var(--muted)]">
        <Icon size={16} />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
  connected,
}: {
  status: DashboardStatus["internet"]["status"];
  connected?: boolean;
}) {
  if (connected === false) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-medium text-amber-400">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Нет связи с роутером
      </span>
    );
  }
  if (status === "on") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-ring" />
        Интернет включён
      </span>
    );
  }
  if (status === "off") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-1.5 text-sm font-medium text-red-400">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        Интернет отключён
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-zinc-500/15 px-4 py-1.5 text-sm font-medium text-zinc-400">
      Статус неизвестен
    </span>
  );
}

export default function Dashboard() {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [bitrix, setBitrix] = useState<BitrixStatus | null>(null);
  const [regru, setRegru] = useState<RegruStatus | null>(null);
  const [vmware, setVmware] = useState<VmwareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<AppTab>("control");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("novactiv_remember");
    localStorage.removeItem("novactiv_device_secret");
    window.location.href = "/login";
  }

  const fetchStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const fetchJson = async (url: string, timeoutMs: number) => {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      };

      const [bitrixRes, mikrotikRes] = await Promise.allSettled([
        fetchJson("/api/bitrix", 25_000),
        fetchJson("/api/status", 35_000),
      ]);

      if (bitrixRes.status === "fulfilled") {
        setBitrix(bitrixRes.value as BitrixStatus);
      }

      if (mikrotikRes.status === "fulfilled") {
        setStatus(mikrotikRes.value as DashboardStatus);
      } else if (!options?.silent) {
        setMessage("Не удалось загрузить статус роутера");
      }
    } catch {
      if (!options?.silent) {
        setMessage("Не удалось загрузить статус");
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus({ silent: true }), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function runAction(action: "on" | "off" | "setup") {
    setActionLoading(`net-${action}`);
    setMessage(null);
    try {
      const res = await fetch("/api/internet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setMessage(data.message);
      if (data.ok) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                internet: {
                  ...prev.internet,
                  status: action === "off" ? "off" : action === "on" ? "on" : prev.internet.status,
                },
              }
            : prev,
        );
        void fetchStatus({ silent: true });
      }
    } catch {
      setMessage("Ошибка при выполнении действия");
    } finally {
      setActionLoading(null);
    }
  }

  async function runBitrixAction(action: "open" | "close") {
    setActionLoading(`bitrix-${action}`);
    setMessage(null);
    try {
      const res = await fetch("/api/bitrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        closed?: boolean | null;
        lockedUsersCount?: number;
      };
      setMessage(data.message);
      if (data.closed != null) {
        setBitrix((prev) =>
          prev
            ? {
                ...prev,
                closed: data.closed,
                lockedUsersCount: data.lockedUsersCount ?? prev.lockedUsersCount,
              }
            : prev,
        );
      }
      if (data.ok || data.closed) await fetchStatus({ silent: true });
    } catch {
      setMessage("Ошибка Bitrix");
    } finally {
      setActionLoading(null);
    }
  }

  const safety = status?.safety;
  const isSafeMode = !safety?.allowWrite || safety?.dryRun;

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium uppercase tracking-widest text-[var(--accent)]">
            Novactiv
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Access Control</h1>
          <p className="mt-2 text-[var(--muted)]">Управление доступом в офисе</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void logout()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium transition hover:border-red-500/40 hover:bg-red-500/10"
          >
            <Lock size={16} />
            Выйти
          </button>
          <button
            onClick={() => void fetchStatus()}
            disabled={loading && tab === "control"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--accent-glow)] disabled:opacity-50"
          >
            {loading && tab === "control" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Обновить
          </button>
        </div>
      </header>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="inline-flex rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1">
          <button
            type="button"
            onClick={() => setTab("control")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "control"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            Управление
          </button>
          <button
            type="button"
            onClick={() => setTab("credentials")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "credentials"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <KeyRound size={16} />
            Доступы IT
          </button>
          <button
            type="button"
            onClick={() => setTab("vault")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "vault"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <Briefcase size={16} />
            Хранилище
          </button>
          <button
            type="button"
            onClick={() => setTab("accounts")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "accounts"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <Mail size={16} />
            Аккаунты
          </button>
          <button
            type="button"
            onClick={() => setTab("employees")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "employees"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <Users size={16} />
            Сотрудники
          </button>
          <button
            type="button"
            onClick={() => setTab("screens")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "screens"
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <Monitor size={16} />
            Экраны
          </button>
        </div>
      </div>

      {tab === "credentials" ? (
        <CredentialsPanel pin="" />
      ) : tab === "vault" ? (
        <VaultPanel pin="" />
      ) : tab === "accounts" ? (
        <AccountsPanel pin="" />
      ) : tab === "employees" ? (
        <EmployeesPanel pin="" />
      ) : tab === "screens" ? (
        <RemoteDesktopPanel />
      ) : (
        <>

      {isSafeMode && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={20} />
          <div>
            <p className="font-medium text-amber-200">Безопасный режим</p>
            <p className="mt-1 text-sm text-amber-200/80">
              {!safety?.allowWrite
                ? "Запись на роутер отключена — интернет физически не меняется."
                : "Dry-run: действия только симулируются."}
              {" "}Для реального управления настройте .env.local (см. README).
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mb-8 rounded-2xl border p-4 text-sm ${
            message.startsWith("[Dry-run]") || message.includes("создано")
              ? "border-blue-500/30 bg-blue-500/10 text-blue-200"
              : message.includes("отключена") || message.includes("Неверный")
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Router}
          label="Роутер"
          value={status?.router?.boardName ?? (loading ? "…" : "Нет связи")}
        />
        <StatCard
          icon={Activity}
          label="Версия"
          value={status?.router?.version ?? "—"}
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={status?.router ? `${status.router.cpuLoad}%` : "—"}
        />
        <StatCard
          icon={HardDrive}
          label="Память"
          value={status?.router ? `${status.router.memoryUsedPercent}%` : "—"}
        />
      </div>

      <div className="mb-8 overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="border-b border-[var(--card-border)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Блокировка офиса</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Интернет в офисе отключается, камеры снаружи остаются доступны
              </p>
            </div>
            <StatusBadge
              status={status?.internet.status ?? "unknown"}
              connected={status?.connected}
            />
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-8">
            <div
              className={`mb-6 flex h-28 w-28 items-center justify-center rounded-full ${
                status?.internet.status === "off"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {status?.internet.status === "off" ? <WifiOff size={48} /> : <Wifi size={48} />}
            </div>
            <p className="text-center text-sm text-[var(--muted)]">
              {status === null
                ? "Загрузка…"
                : !status.connected
                  ? status.error ?? "Не удалось подключиться к MikroTik API"
                  : status.internet.ruleStatus === "not_configured"
                    ? "Правило блокировки ещё не создано на роутере"
                    : status.internet.ruleStatus === "ready"
                      ? "Правило готово, интернет работает"
                      : status.internet.ruleStatus === "active"
                        ? "Интернет в офисе отключён (камеры работают)"
                        : "—"}
            </p>
            <p className="mt-3 text-center text-sm text-[var(--muted)]">
              {status?.cameras?.externalAccess === "blocked"
                ? `Камеры снаружи недоступны (${status.cameras.natRulesBlocked}/${status.cameras.natRulesTotal})`
                : status?.cameras?.externalAccess === "open"
                  ? `Камеры доступны с интернета (${status.cameras.natRulesTotal} пробросов)`
                  : status?.cameras?.externalAccess === "partial"
                    ? `Часть камер недоступна (${status.cameras.natRulesBlocked}/${status.cameras.natRulesTotal})`
                    : "Камеры: —"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[var(--muted)]">
              {status?.cameras?.externalAccess === "blocked" ? (
                <VideoOff size={16} className="text-red-400" />
              ) : (
                <Video size={16} />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {status?.internet.ruleStatus === "not_configured" && (
              <button
                onClick={() => void runAction("setup")}
                disabled={!!actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {actionLoading === "net-setup" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Shield size={18} />
                )}
                Подготовить правило (безопасно)
              </button>
            )}

            <button
              onClick={() => void runAction("off")}
              disabled={!!actionLoading || status?.internet.ruleStatus === "not_configured"}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3.5 font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
            >
              {actionLoading === "net-off" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Power size={18} />
              )}
              Отключить интернет
            </button>

            <button
              onClick={() => void runAction("on")}
              disabled={!!actionLoading || status?.internet.ruleStatus === "not_configured"}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3.5 font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {actionLoading === "net-on" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Wifi size={18} />
              )}
              Включить интернет
            </button>

            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Блокируется весь исходящий трафик из офиса (включая открытые сессии) и все
              пробросы портов внутрь. Работает только удалённый доступ к MikroTik для
              включения обратно. Локальная сеть офиса (ПК↔ПК) не режется.
            </p>
            {status?.mgmtLock?.active ? (
              <p className="mt-3 text-xs leading-relaxed text-emerald-400">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck size={14} />
                  {status.mgmtLock.geoCountries?.length
                    ? `Доступ к роутеру: whitelist 0_WL + страны ${status.mgmtLock.geoCountries.join(", ")} (${status.mgmtLock.geoCidrCount ?? "…"} подсетей)`
                    : "Доступ к роутеру: только whitelist 0_WL. Для Вьетнама: MIKROTIK_MGMT_ALLOW_COUNTRIES=VN"}
                </span>
              </p>
            ) : status?.mgmtLock?.configured === false && status?.connected ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                <ShieldAlert size={14} />
                Защита роутера применится при следующем обновлении статуса.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-8 overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="border-b border-[var(--card-border)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Bitrix24 — блокировка входа</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Сотрудники остаются в портале, но не могут войти по логину/паролю
              </p>
            </div>
            {bitrix?.configured && bitrix.connected ? (
              <span
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
                  bitrix.closed
                    ? "bg-red-500/15 text-red-400"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {bitrix.closed ? <GlobeLock size={16} /> : <Globe size={16} />}
                {bitrix.closed ? "Вход закрыт" : "Вход открыт"}
              </span>
            ) : bitrix?.configured && bitrix.error ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-1.5 text-sm font-medium text-red-400">
                Ошибка связи
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-zinc-500/15 px-4 py-1.5 text-sm font-medium text-zinc-400">
                Не настроен
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-8">
            <div
              className={`mb-6 flex h-28 w-28 items-center justify-center rounded-full ${
                bitrix?.closed
                  ? "bg-red-500/15 text-red-400"
                  : "bg-violet-500/15 text-violet-400"
              }`}
            >
              {bitrix?.closed ? <Lock size={48} /> : <Unlock size={48} />}
            </div>
            <p className="text-center text-sm text-[var(--muted)]">
              {!bitrix?.configured
                ? "Создайте входящий вебхук в Bitrix24 → BITRIX24_WEBHOOK_URL"
                : bitrix.error
                  ? bitrix.error
                  : bitrix.hint
                    ? bitrix.hint
                    : bitrix.closed
                    ? `Вход заблокирован (${bitrix.lockedUsersCount} сотрудников)`
                    : "Все могут входить в портал"}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => void runBitrixAction("close")}
              disabled={!!actionLoading || !bitrix?.configured || !bitrix?.connected || bitrix?.canLockUsers === false}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3.5 font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
            >
              {actionLoading === "bitrix-close" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Lock size={18} />
              )}
              Запретить вход
            </button>

            <button
              onClick={() => void runBitrixAction("open")}
              disabled={!!actionLoading || !bitrix?.configured || !bitrix?.connected || bitrix?.canLockUsers === false}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3.5 font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {actionLoading === "bitrix-open" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Unlock size={18} />
              )}
              Разрешить вход
            </button>

            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              В Bitrix24 облаке это штатная временная блокировка: сотрудники не удаляются,
              задачи и файлы остаются. Администраторы портала (ID 9, 29 и др. из BITRIX_EXCLUDE_USER_IDS)
              не блокируются — иначе сбрасываются права CRM. При «Разрешить вход» восстанавливается
              отдел и должность.
            </p>
          </div>
        </div>
      </div>

      <VmwarePanel pin="" onMessage={setMessage} onStatusChange={setVmware} />

      <RegruPanel pin="" onMessage={setMessage} onStatusChange={setRegru} />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--muted)]">Сервисы</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { name: "MikroTik", status: status?.connected ? "online" : "offline", active: true },
            {
              name: "VMware",
              status: !vmware?.configured
                ? "настроить"
                : vmware.connected
                  ? `${vmware.runningCount}/${vmware.totalCount} VM`
                  : "ошибка",
              active: true,
            },
            {
              name: "Bitrix",
              status: !bitrix?.configured
                ? "настроить"
                : bitrix.closed
                  ? "вход закрыт"
                  : bitrix.connected
                    ? "вход открыт"
                    : "ошибка",
              active: true,
            },
            {
              name: "Reg.ru",
              status: !regru?.configured
                ? "настроить"
                : regru.connected
                  ? `${regru.activeCount}/${regru.activeCount + regru.suspendedCount} сайтов`
                  : "ошибка",
              active: true,
            },
            { name: "Камеры / NAT", status: status?.cameras?.externalAccess === "blocked" ? "закрыты" : status?.cameras?.externalAccess === "open" ? "открыты" : "—", active: true },
          ].map((service) => (
            <div
              key={service.name}
              className={`rounded-2xl border p-5 ${
                service.active
                  ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                  : "border-[var(--card-border)] bg-[var(--card)] opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{service.name}</span>
                {service.active &&
                (service.name === "Bitrix"
                  ? bitrix?.connected
                  : service.name === "Reg.ru"
                    ? regru?.connected
                    : service.name === "VMware"
                      ? vmware?.connected
                      : status?.connected) ? (
                  <ShieldCheck size={18} className="text-emerald-400" />
                ) : (
                  <Shield size={18} className="text-[var(--muted)]" />
                )}
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{service.status}</p>
            </div>
          ))}
        </div>
      </section>

      {status?.error && (
        <p className="mt-6 text-center text-sm text-red-400">{status.error}</p>
      )}
        </>
      )}
    </div>
  );
}
