"use client";

import type { RegruServiceInfo, RegruStatus } from "@/lib/regru";
import {
  AlertCircle,
  Calendar,
  Globe,
  Loader2,
  Power,
  RefreshCw,
  Server,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const POLL_MS = 15_000;

type Props = {
  pin: string;
  onMessage?: (message: string) => void;
  onStatusChange?: (status: RegruStatus | null) => void;
};

function formatDate(date: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return date;
  }
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

function HostingAccountCard({
  service,
  actionLoading,
  optimisticSites,
  onToggleSite,
}: {
  service: RegruServiceInfo;
  actionLoading: string | null;
  optimisticSites: Record<string, boolean>;
  onToggleSite: (serviceId: string, domain: string, enabled: boolean) => void;
}) {
  const sites = service.sites ?? [];
  const enabledCount = sites.filter((site) => {
    const key = `${service.serviceId}:${site.domain}`;
    return optimisticSites[key] ?? site.enabled;
  }).length;

  return (
    <article className="rounded-2xl border border-violet-500/20 bg-[var(--background)]/80 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">{service.label}</h4>
          <p className="text-xs text-[var(--muted)]">
            {service.typeLabel} · {service.plan} · {enabledCount}/{sites.length} сайтов вкл.
          </p>
        </div>
        <Globe size={20} className="shrink-0 text-violet-300" />
      </div>

      {service.panelError && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {service.panelError}
        </p>
      )}

      {sites.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Сайты не загружены</p>
      ) : (
        <ul className="space-y-2">
          {sites.map((site) => {
            const key = `${service.serviceId}:${site.domain}`;
            const enabled = optimisticSites[key] ?? site.enabled;
            const busy = actionLoading === key;

            return (
              <li
                key={site.domain}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)]/70 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{site.domain}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {enabled ? "Работает" : "Отключён"}
                  </p>
                </div>
                <PowerSwitch
                  checked={enabled}
                  disabled={!!actionLoading && !busy}
                  loading={busy}
                  onChange={() => onToggleSite(service.serviceId, site.domain, enabled)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Calendar size={12} />
        Оплачен до {formatDate(service.expirationDate)}
      </p>
    </article>
  );
}

function DedicatedCard({ service }: { service: RegruServiceInfo }) {
  return (
    <article className="rounded-2xl border border-zinc-700/80 bg-[var(--background)]/80 p-5">
      <div className="flex items-start gap-3">
        <Server size={20} className="shrink-0 text-zinc-400" />
        <div>
          <h4 className="font-semibold">{service.label}</h4>
          <p className="text-xs text-[var(--muted)]">{service.typeLabel}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Выделенный сервер — питание и ВМ через вкладку VMware, не через Reg.ru.
          </p>
        </div>
      </div>
    </article>
  );
}

export default function RegruPanel({ pin, onMessage, onStatusChange }: Props) {
  const [status, setStatus] = useState<RegruStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [optimisticSites, setOptimisticSites] = useState<Record<string, boolean>>({});

  const fetchStatus = useCallback(
    async (silent = false, force = false) => {
      if (actionLoading && !force) return;
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch("/api/regru", {
          cache: "no-store",
          signal: AbortSignal.timeout(60_000),
        });
        const data = (await res.json()) as RegruStatus;
        setStatus(data);
        onStatusChange?.(data);
      } catch {
        if (!silent) onMessage?.("Не удалось обновить список Reg.ru");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [actionLoading, onMessage, onStatusChange],
  );

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(true), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function runSite(serviceId: string, domain: string, currentlyEnabled: boolean) {
    const key = `${serviceId}:${domain}`;
    const action = currentlyEnabled ? "site-off" : "site-on";

    setOptimisticSites((prev) => ({ ...prev, [key]: !currentlyEnabled }));
    setActionLoading(key);
    onMessage?.(currentlyEnabled ? `Отключаем ${domain}…` : `Включаем ${domain}…`);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pin) headers["x-app-pin"] = pin;

      const res = await fetch("/api/regru", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, serviceId, domain }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      onMessage?.(data.message);
      await fetchStatus(true, true);
    } catch {
      onMessage?.("Не удалось выполнить действие");
      setOptimisticSites((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } finally {
      setActionLoading(null);
      setOptimisticSites((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  }

  const hostings = useMemo(
    () => status?.services.filter((s) => s.kind === "hosting") ?? [],
    [status?.services],
  );
  const dedicated = useMemo(
    () => status?.services.filter((s) => s.kind === "dedicated") ?? [],
    [status?.services],
  );

  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-[var(--card)] to-[var(--card)] shadow-[0_20px_60px_-30px_rgba(139,92,246,0.35)]">
      <header className="border-b border-violet-500/10 p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-600/20 text-violet-300 shadow-lg shadow-violet-500/10">
              <Globe size={28} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/80">
                Reg.ru
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Хостинги и серверы</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                Вкл/выкл сайтов через ISPmanager — по одному домену на каждом хостинге.
              </p>
              {status?.accountLogin && (
                <p className="mt-2 text-xs text-violet-300/80">
                  Аккаунт: <span className="font-mono">{status.accountLogin}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {status?.connected && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-ring" />
                Live · {POLL_MS / 1000}с
              </span>
            )}
            {status?.updatedAt && (
              <span className="text-xs text-[var(--muted)]">
                {formatUpdatedAt(status.updatedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchStatus()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/60 px-3 py-2 text-xs font-medium transition hover:border-violet-500/40 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Обновить
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 sm:p-8">
        {!status?.configured ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-0.5 shrink-0 text-amber-400" size={22} />
              <div>
                <h3 className="font-semibold text-amber-100">Нужен логин Reg.ru</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Логин и пароль из раздела «Доступы» → «Рег.ру». Облачных VPS у вас нет — управляем
                  хостингами novactiv.ru / novactiv.team и выделенным сервером.
                </p>
              </div>
            </div>
          </div>
        ) : status.error && !status.connected ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} />
              <div>
                <h3 className="font-semibold text-red-200">{status.error}</h3>
                {status.hint && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{status.hint}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <StatPill label="Сайтов вкл." value={status?.activeCount ?? 0} tone="emerald" />
              <StatPill label="Сайтов выкл." value={status?.suspendedCount ?? 0} tone="rose" />
              <StatPill label="Хостингов" value={hostings.length} tone="sky" />
            </div>

            {status?.hint && (
              <p className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-xs text-violet-200/90">
                {status.hint}
              </p>
            )}

            {initialLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-36 animate-pulse rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/50"
                  />
                ))}
              </div>
            ) : (status?.services.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--card-border)] py-16 text-center">
                <Globe className="mx-auto mb-3 text-[var(--muted)]" size={32} />
                <p className="text-sm text-[var(--muted)]">Услуги не найдены в аккаунте Reg.ru</p>
              </div>
            ) : (
              <div className="space-y-8">
                {hostings.length > 0 && (
                  <div>
                    <h3 className="mb-4 text-sm font-medium text-[var(--muted)]">Хостинги и сайты</h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {hostings.map((service) => (
                        <HostingAccountCard
                          key={service.serviceId}
                          service={service}
                          actionLoading={actionLoading}
                          optimisticSites={optimisticSites}
                          onToggleSite={(serviceId, domain, enabled) =>
                            void runSite(serviceId, domain, enabled)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {dedicated.length > 0 && (
                  <div>
                    <h3 className="mb-4 text-sm font-medium text-[var(--muted)]">Выделенный сервер</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {dedicated.map((service) => (
                        <DedicatedCard key={service.serviceId} service={service} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
