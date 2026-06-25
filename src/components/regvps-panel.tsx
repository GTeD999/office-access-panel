"use client";

import type { RegletInfo, RegvpsStatus } from "@/lib/regvps";
import {
  AlertCircle,
  Cloud,
  Cpu,
  HardDrive,
  Loader2,
  MapPin,
  Power,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const POLL_MS = 10_000;

type Props = {
  pin: string;
  onMessage?: (message: string) => void;
  onStatusChange?: (status: RegvpsStatus | null) => void;
};

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Работает";
    case "off":
      return "Выключен";
    case "new":
      return "Создаётся";
    case "suspended":
      return "Приостановлен";
    default:
      return status;
  }
}

function statusTone(status: string): "on" | "off" | "warn" | "muted" {
  if (status === "active") return "on";
  if (status === "off") return "off";
  if (status === "suspended" || status === "new") return "warn";
  return "muted";
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "rose" | "zinc";
}) {
  const tones = {
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-300",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    zinc: "border-zinc-500/25 bg-zinc-500/10 text-zinc-300",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PowerSwitch({
  checked,
  disabled,
  loading,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || loading}
      onClick={onChange}
      className={`group relative h-8 w-14 shrink-0 rounded-full border transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? "border-emerald-400/50 bg-emerald-500/20 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
          : "border-zinc-600 bg-zinc-800/80"
      }`}
    >
      <span
        className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
          checked
            ? "left-7 bg-emerald-400 text-emerald-950 shadow-lg"
            : "left-1 bg-zinc-500 text-zinc-900"
        }`}
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Power size={12} className={checked ? "opacity-90" : "opacity-60"} />
        )}
      </span>
    </button>
  );
}

function RegletCard({
  reglet,
  busy,
  disabled,
  onToggle,
}: {
  reglet: RegletInfo;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const tone = statusTone(reglet.status);
  const canToggle = reglet.status === "active" || reglet.status === "off";
  const isOn = reglet.status === "active";

  const borderClass =
    tone === "on"
      ? "border-emerald-500/30 shadow-[0_0_0_1px_rgba(34,197,94,0.08)]"
      : tone === "off"
        ? "border-zinc-700/80"
        : "border-amber-500/25";

  return (
    <article
      className={`reglet-card animate-fade-slide-in rounded-2xl border bg-[var(--background)]/80 p-5 backdrop-blur-sm transition hover:border-sky-500/30 ${borderClass}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isOn ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              <Server size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="truncate font-semibold">{reglet.name}</h4>
              <p className="truncate font-mono text-xs text-[var(--muted)]">
                {reglet.ip || "IP назначается…"}
              </p>
            </div>
          </div>
        </div>
        {canToggle ? (
          <PowerSwitch
            checked={isOn}
            disabled={disabled}
            loading={busy}
            onChange={onToggle}
          />
        ) : (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            {statusLabel(reglet.status)}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            tone === "on"
              ? "bg-emerald-500/15 text-emerald-400"
              : tone === "off"
                ? "bg-zinc-700/50 text-zinc-300"
                : "bg-amber-500/15 text-amber-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              tone === "on" ? "bg-emerald-400 animate-pulse-ring" : tone === "off" ? "bg-zinc-500" : "bg-amber-400"
            }`}
          />
          {statusLabel(reglet.status)}
        </span>
        {reglet.region && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300">
            <MapPin size={11} />
            {reglet.region}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-[var(--muted)]">
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-2 py-1.5">
          <Cpu size={12} />
          {reglet.vcpus || "—"} vCPU
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-2 py-1.5">
          <Zap size={12} />
          {reglet.memory ? formatMemory(reglet.memory) : "—"}
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-2 py-1.5">
          <HardDrive size={12} />
          {reglet.disk ? `${reglet.disk} GB` : "—"}
        </div>
      </div>

      {(reglet.sizeName || reglet.imageName) && (
        <p className="mt-3 truncate text-xs text-[var(--muted)]">
          {[reglet.sizeName, reglet.imageName].filter(Boolean).join(" · ")}
        </p>
      )}
    </article>
  );
}

export default function RegvpsPanel({ pin, onMessage, onStatusChange }: Props) {
  const [status, setStatus] = useState<RegvpsStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch("/api/regvps", { cache: "no-store" });
        const data = (await res.json()) as RegvpsStatus;
        setStatus(data);
        onStatusChange?.(data);
      } catch {
        if (!silent) onMessage?.("Не удалось обновить список Reg.ru");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [onMessage, onStatusChange],
  );

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(true), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function postAction(body: Record<string, unknown>) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (pin) headers["x-app-pin"] = pin;

    const res = await fetch("/api/regvps", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; message: string };
    onMessage?.(data.message);
    if (data.ok) await fetchStatus(true);
    return data.ok;
  }

  async function runBulk(action: "off" | "on") {
    setActionLoading(`bulk-${action}`);
    try {
      await postAction({ action });
    } finally {
      setActionLoading(null);
    }
  }

  async function runReglet(reglet: RegletInfo) {
    const next = reglet.status === "active" ? "stop" : "start";
    setActionLoading(`reglet-${reglet.id}`);
    try {
      await postAction({ action: next, regletId: reglet.id });
    } finally {
      setActionLoading(null);
    }
  }

  const sortedReglets = useMemo(
    () =>
      [...(status?.reglets ?? [])].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return a.name.localeCompare(b.name, "ru");
      }),
    [status?.reglets],
  );

  const allRunning = status?.totalCount ? status.runningCount === status.totalCount : false;
  const allStopped = status?.totalCount ? status.runningCount === 0 : false;

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] via-[var(--card)] to-[var(--card)] shadow-[0_20px_60px_-30px_rgba(14,165,233,0.35)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />

      <header className="border-b border-sky-500/10 p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/30 to-blue-600/20 text-sky-300 shadow-lg shadow-sky-500/10">
              <Cloud size={28} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/80">
                Reg.ru Cloud VPS
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Облачные серверы</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                Список обновляется каждые {POLL_MS / 1000} сек — новые серверы появятся автоматически
              </p>
              {status?.accountLogin && (
                <p className="mt-2 text-xs text-sky-300/80">
                  Аккаунт: <span className="font-mono">{status.accountLogin}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {status?.connected && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-ring" />
                Live
              </span>
            )}
            {status?.updatedAt && (
              <span className="text-xs text-[var(--muted)]">
                Обновлено {formatUpdatedAt(status.updatedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchStatus()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/60 px-3 py-2 text-xs font-medium transition hover:border-sky-500/40 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Обновить
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 sm:p-8">
        {!status?.configured ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-0.5 shrink-0 text-amber-400" size={22} />
              <div>
                <h3 className="font-semibold text-amber-100">Нужен API-токен Reg.ru</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Логин и пароль из раздела «Доступы» — для входа в личный кабинет. Для управления
                  серверами Reg.ru выдаёт отдельный токен (один раз):
                </p>
                <ol className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                  <li>1. Войти на reg.ru как {status?.accountLogin ?? "администратор"}</li>
                  <li>2. Облачные VPS → Настройки → скопировать «Токен API»</li>
                  <li>
                    3. Добавить в{" "}
                    <code className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-xs">
                      .data/credentials.json
                    </code>{" "}
                    у записи «Рег.ру»:{" "}
                    <code className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-xs">
                      &quot;apiToken&quot;: &quot;…&quot;
                    </code>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        ) : status.error && !status.connected ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 text-red-400" size={28} />
            <p className="text-sm text-red-300">{status.error}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <StatPill label="Запущено" value={status?.runningCount ?? 0} tone="emerald" />
              <StatPill label="Выключено" value={status?.stoppedCount ?? 0} tone="rose" />
              <StatPill label="Всего" value={status?.totalCount ?? 0} tone="sky" />
            </div>

            <div className="mb-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void runBulk("off")}
                disabled={
                  !!actionLoading ||
                  !status?.connected ||
                  allStopped ||
                  (status?.runningCount ?? 0) === 0
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/35 bg-gradient-to-b from-red-500/15 to-red-500/5 px-5 py-4 font-semibold text-red-200 transition hover:from-red-500/25 disabled:opacity-40"
              >
                {actionLoading === "bulk-off" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Power size={18} />
                )}
                Выключить все
              </button>
              <button
                type="button"
                onClick={() => void runBulk("on")}
                disabled={
                  !!actionLoading ||
                  !status?.connected ||
                  allRunning ||
                  (status?.stoppedCount ?? 0) === 0
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-500/35 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 px-5 py-4 font-semibold text-emerald-200 transition hover:from-emerald-500/25 disabled:opacity-40"
              >
                {actionLoading === "bulk-on" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Power size={18} />
                )}
                Включить все
              </button>
            </div>

            {status?.hint && (
              <p className="mb-6 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-sky-200/90">
                {status.hint}
              </p>
            )}

            {initialLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-44 animate-pulse rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/50"
                  />
                ))}
              </div>
            ) : sortedReglets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--card-border)] py-16 text-center">
                <Server className="mx-auto mb-3 text-[var(--muted)]" size={32} />
                <p className="text-sm text-[var(--muted)]">Серверов пока нет — они появятся здесь автоматически</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sortedReglets.map((reglet) => (
                  <RegletCard
                    key={reglet.id}
                    reglet={reglet}
                    busy={actionLoading === `reglet-${reglet.id}`}
                    disabled={!!actionLoading || !status?.connected}
                    onToggle={() => void runReglet(reglet)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
