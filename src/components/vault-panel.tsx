"use client";

import type { VaultCategory, VaultEntry, VaultStore } from "@/lib/vault-types";
import {
  Archive,
  Briefcase,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  agents: Users,
  services: Wrench,
  spare: KeyRound,
  trash: Archive,
};

type Props = {
  pin: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function VaultRow({ entry }: { entry: VaultEntry }) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleCopy(label: string, value: string) {
    const ok = await copyText(value);
    if (ok) {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  const openHref = entry.url?.startsWith("http") ? entry.url : undefined;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{entry.title}</p>
          {entry.username && (
            <p className="mt-1 truncate font-mono text-sm text-[var(--muted)]">{entry.username}</p>
          )}
        </div>
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
          >
            <ExternalLink size={14} />
            Открыть
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {entry.username && (
          <button
            type="button"
            onClick={() => void handleCopy("user", entry.username!)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs transition hover:bg-[var(--card-border)]"
          >
            {copied === "user" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            Логин
          </button>
        )}
        {entry.password && (
          <>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs transition hover:bg-[var(--card-border)]"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPassword ? entry.password : "••••••••"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy("pass", entry.password!)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs transition hover:bg-[var(--card-border)]"
            >
              {copied === "pass" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              Пароль
            </button>
          </>
        )}
      </div>

      {entry.notes && (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--card)] p-3 text-xs leading-relaxed text-[var(--muted)]">
          {entry.notes}
        </pre>
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  defaultOpen,
}: {
  category: VaultCategory;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = CATEGORY_ICONS[category.id] ?? Briefcase;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--background)]/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Icon size={20} />
          </div>
          <div>
            <h3 className="font-semibold">{category.title}</h3>
            {category.description && (
              <p className="text-sm text-[var(--muted)]">{category.description}</p>
            )}
          </div>
          <span className="ml-2 rounded-full bg-[var(--card-border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
            {category.entries.length}
          </span>
        </div>
        <ChevronDown
          size={20}
          className={`shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-[var(--card-border)] p-4 sm:grid-cols-2 lg:grid-cols-3">
          {category.entries.map((entry) => (
            <VaultRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VaultPanel({ pin }: Props) {
  const [store, setStore] = useState<VaultStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (pin) headers["x-app-pin"] = pin;

      const res = await fetch("/api/vault", {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as VaultStore & { ok?: boolean; message?: string };

      if (!res.ok) {
        setError(data.message ?? "Не удалось загрузить хранилище");
        setStore(null);
        return;
      }

      setStore(data);
    } catch {
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [pin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!store) return null;
    const q = query.trim().toLowerCase();

    const categories = store.categories
      .filter((c) => (c.id === "trash" ? showTrash : true))
      .map((c) => {
        if (!q) return c;
        const entries = c.entries.filter((e) =>
          [e.title, e.username, e.url, e.notes, e.group]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
        );
        return { ...c, entries };
      })
      .filter((c) => c.entries.length > 0);

    return { ...store, categories };
  }, [store, query, showTrash]);

  const stats = useMemo(() => {
    if (!store) return null;
    const total = store.categories.reduce((n, c) => n + c.entries.length, 0);
    const agents = store.categories.find((c) => c.id === "agents")?.entries.length ?? 0;
    const services = store.categories.find((c) => c.id === "services")?.entries.length ?? 0;
    return { total, agents, services };
  }, [store]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--muted)]">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (error || !filtered) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-200">
        {error ?? "Нет данных"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted)]">Всего записей</p>
            <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted)]">Агенты</p>
            <p className="mt-1 text-2xl font-semibold">{stats.agents}</p>
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <p className="text-sm text-[var(--muted)]">Сервисы</p>
            <p className="mt-1 text-2xl font-semibold">{stats.services}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: имя, email, сервис, заметка…"
            className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={showTrash}
            onChange={(e) => setShowTrash(e.target.checked)}
            className="rounded"
          />
          Корзина
        </label>
      </div>

      <div className="space-y-3">
        {filtered.categories.map((category, i) => (
          <CategoryBlock
            key={category.id}
            category={category}
            defaultOpen={category.id !== "trash" && i === 0}
          />
        ))}
      </div>

      {filtered.categories.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Ничего не найдено</p>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Данные в{" "}
        <code className="rounded bg-[var(--card)] px-1.5 py-0.5">.data/vault.json</code> — не в git.
        Импорт:{" "}
        <code className="rounded bg-[var(--card)] px-1.5 py-0.5">
          node scripts/import-vault-tsv.mjs export.tsv
        </code>
      </p>
    </div>
  );
}
