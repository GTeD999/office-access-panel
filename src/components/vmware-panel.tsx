"use client";

import type { VmInfo, VmwareStatus } from "@/lib/vmware";
import {
  AlertCircle,
  Cpu,
  HardDrive,
  Loader2,
  Power,
  RefreshCw,
  Server,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const POLL_MS = 30_000;
const VM_STATE_POLL_MS = 2_000;
const VM_STATE_POLL_MAX_MS = 45_000;

type Props = {
  pin: string;
  onMessage?: (message: string) => void;
  onStatusChange?: (status: VmwareStatus | null) => void;
};

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

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
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
      className={`relative h-8 w-14 shrink-0 rounded-full border transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
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

function VmCard({
  vm,
  pendingState,
  busy,
  disabled,
  onToggle,
}: {
  vm: VmInfo;
  pendingState?: VmInfo["powerState"];
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const actualOn = vm.powerState === "on";
  const displayOn =
    pendingState !== undefined ? pendingState === "on" : actualOn;
  const isTransitioning =
    pendingState !== undefined && pendingState !== vm.powerState;
  const canToggle = vm.powerState === "on" || vm.powerState === "off";

  const statusLabel = isTransitioning
    ? pendingState === "off"
      ? "Выключение…"
      : "Запуск…"
    : displayOn
      ? "Запущена"
      : vm.powerState === "off"
        ? "Выключена"
        : vm.powerState;

  return (
    <article
      className={`reglet-card animate-fade-slide-in rounded-2xl border bg-[var(--background)]/80 p-5 backdrop-blur-sm transition hover:border-cyan-500/30 ${
        displayOn ? "border-emerald-500/30" : "border-zinc-700/80"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                displayOn ? "bg-cyan-500/15 text-cyan-400" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {vm.role?.includes("Directory") ? (
                <Shield size={18} />
              ) : (
                <Server size={18} />
              )}
            </div>
            <div className="min-w-0">
              <h4 className="truncate font-semibold">{vm.name}</h4>
              {vm.role && (
                <p className="truncate text-xs text-cyan-300/80">{vm.role}</p>
              )}
            </div>
          </div>
        </div>
        {canToggle ? (
          <PowerSwitch
            checked={displayOn}
            disabled={disabled}
            loading={busy || isTransitioning}
            onChange={onToggle}
          />
        ) : (
          <span className="rounded-full border border-zinc-600 px-2.5 py-1 text-xs text-zinc-400">
            {vm.powerState}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
            isTransitioning
              ? "bg-amber-500/15 text-amber-300"
              : displayOn
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-zinc-700/50 text-zinc-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isTransitioning
                ? "bg-amber-400 animate-pulse-ring"
                : displayOn
                  ? "bg-emerald-400 animate-pulse-ring"
                  : "bg-zinc-500"
            }`}
          />
          {statusLabel}
        </span>
        {vm.cpus > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--card)] px-2 py-1">
            <Cpu size={11} />
            {vm.cpus} vCPU
          </span>
        )}
        {vm.memoryMb > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--card)] px-2 py-1">
            <HardDrive size={11} />
            {formatMemory(vm.memoryMb)}
          </span>
        )}
      </div>
    </article>
  );
}

export default function VmwarePanel({ pin, onMessage, onStatusChange }: Props) {
  const [status, setStatus] = useState<VmwareStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingStates, setPendingStates] = useState<
    Record<string, VmInfo["powerState"]>
  >({});

  const applyStatus = useCallback(
    (data: VmwareStatus) => {
      setStatus(data);
      onStatusChange?.(data);
      setPendingStates((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        const next = { ...prev };
        for (const vm of data.vms) {
          if (next[vm.id] === vm.powerState) delete next[vm.id];
        }
        return next;
      });
    },
    [onStatusChange],
  );

  const fetchStatus = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/vmware?_=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        const data = (await res.json()) as VmwareStatus;
        applyStatus(data);
      } catch {
        if (!silent) onMessage?.("Не удалось обновить список VMware");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [applyStatus, onMessage],
  );

  async function pollVmState(
    vmId: string,
    expected: VmInfo["powerState"],
  ): Promise<void> {
    const deadline = Date.now() + VM_STATE_POLL_MAX_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, VM_STATE_POLL_MS));
      try {
        const res = await fetch(`/api/vmware?_=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        const data = (await res.json()) as VmwareStatus;
        applyStatus(data);
        const vm = data.vms.find((item) => item.id === vmId);
        if (vm?.powerState === expected) return;
      } catch {
        return;
      }
    }
  }

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(true), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function postAction(
    body: Record<string, unknown>,
    options?: { vmId?: string; expectedState?: VmInfo["powerState"] },
  ) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (pin) headers["x-app-pin"] = pin;

    const res = await fetch("/api/vmware", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; message: string };
    onMessage?.(data.message);
    if (!data.ok) {
      if (options?.vmId) {
        setPendingStates((prev) => {
          const next = { ...prev };
          delete next[options.vmId!];
          return next;
        });
      }
      return;
    }

    if (options?.vmId && options.expectedState) {
      await pollVmState(options.vmId, options.expectedState);
    } else {
      await fetchStatus(true);
    }
  }

  async function runBulk(action: "off" | "on") {
    setActionLoading(`bulk-${action}`);
    try {
      await postAction({ action });
    } finally {
      setActionLoading(null);
    }
  }

  async function runVm(vm: VmInfo) {
    const next = vm.powerState === "on" ? "stop" : "start";
    const expectedState: VmInfo["powerState"] = next === "stop" ? "off" : "on";
    setPendingStates((prev) => ({ ...prev, [vm.id]: expectedState }));
    setActionLoading(`vm-${vm.id}`);
    try {
      await postAction({ action: next, vmId: vm.id }, { vmId: vm.id, expectedState });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-[var(--card)] to-[var(--card)] shadow-[0_20px_60px_-30px_rgba(6,182,212,0.35)]">
      <header className="border-b border-cyan-500/10 p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/30 to-blue-600/20 text-cyan-300 shadow-lg shadow-cyan-500/10">
              <Server size={28} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/80">
                VMware ESXi
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Гипервизор и виртуальные машины</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
                Выключение и включение VM (AD, web, zabbix…) — диски не удаляются
              </p>
              {status?.host && (
                <p className="mt-2 font-mono text-xs text-cyan-300/70">{status.host}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {status?.connected && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-ring" />
                ESXi подключён
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
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/60 px-3 py-2 text-xs font-medium transition hover:border-cyan-500/40 disabled:opacity-50"
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
              <p className="text-sm text-[var(--muted)]">{status?.error}</p>
            </div>
          </div>
        ) : status.error && !status.connected ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} />
              <div>
                <p className="text-sm text-red-200">{status.error}</p>
                {status.hint && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{status.hint}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <StatPill label="Запущено" value={status?.runningCount ?? 0} tone="emerald" />
              <StatPill label="Выключено" value={status?.stoppedCount ?? 0} tone="rose" />
              <StatPill label="Всего VM" value={status?.totalCount ?? 0} tone="sky" />
            </div>

            <div className="mb-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void runBulk("off")}
                disabled={
                  !!actionLoading || !status?.connected || (status?.runningCount ?? 0) === 0
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-500/35 bg-gradient-to-b from-rose-500/15 to-rose-500/5 px-5 py-4 font-semibold text-rose-200 transition hover:from-rose-500/25 disabled:opacity-40"
              >
                {actionLoading === "bulk-off" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Power size={18} />
                )}
                Выключить все VM
              </button>
              <button
                type="button"
                onClick={() => void runBulk("on")}
                disabled={
                  !!actionLoading || !status?.connected || (status?.stoppedCount ?? 0) === 0
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-500/35 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 px-5 py-4 font-semibold text-emerald-200 transition hover:from-emerald-500/25 disabled:opacity-40"
              >
                {actionLoading === "bulk-on" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Power size={18} />
                )}
                Включить все VM
              </button>
            </div>

            {status?.hint && (
              <p className="mb-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-200/90">
                {status.hint}
              </p>
            )}

            {initialLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-36 animate-pulse rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/50"
                  />
                ))}
              </div>
            ) : (status?.vms.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--card-border)] py-16 text-center">
                <Server className="mx-auto mb-3 text-[var(--muted)]" size={32} />
                <p className="text-sm text-[var(--muted)]">Виртуальные машины не найдены</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {status?.vms.map((vm) => (
                  <VmCard
                    key={vm.id}
                    vm={vm}
                    pendingState={pendingStates[vm.id]}
                    busy={actionLoading === `vm-${vm.id}`}
                    disabled={!!actionLoading || !status?.connected}
                    onToggle={() => void runVm(vm)}
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
