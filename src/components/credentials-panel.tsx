"use client";

import type {
  CredentialCategory,
  CredentialEntry,
  CredentialIcon,
  CredentialsStore,
} from "@/lib/credentials-types";
import {
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Globe,
  HardDrive,
  Download,
  Loader2,
  Monitor,
  Printer,
  Router,
  Scan,
  Search,
  Server,
  User,
  Monitor as DesktopIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MikrotikWebFigButton } from "@/components/mikrotik-webfig-button";

const ICONS: Record<CredentialIcon, React.ElementType> = {
  router: Router,
  monitor: Monitor,
  server: Server,
  printer: Printer,
  cloud: Globe,
  user: User,
  desktop: DesktopIcon,
  globe: Globe,
  "hard-drive": HardDrive,
  scan: Scan,
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

function CredentialRow({
  entry,
  compact,
  categoryId,
}: {
  entry: CredentialEntry;
  compact?: boolean;
  categoryId?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleCopy(label: string, value: string) {
    const ok = await copyText(value);
    if (ok) {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  const canOpenMikrotik =
    categoryId === "mikrotik" &&
    !!entry.username &&
    !!entry.password &&
    !!(entry.url || entry.host);

  const mikrotikGateway = canOpenMikrotik
    ? `/api/mikrotik/gateway/${encodeURIComponent(entry.id)}/`
    : undefined;

  const openHref =
    entry.url ?? (entry.host ? `http://${entry.host}` : undefined);
  const openLabel = "Открыть";

  return (
    <div
      className={`rounded-xl border border-[var(--card-border)] bg-[var(--background)] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{entry.label}</p>
          {entry.note && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{entry.note}</p>
          )}
          {entry.host && !entry.url && (
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">{entry.host}</p>
          )}
          {entry.internetIdServer && (
            <p className="mt-1 font-mono text-xs text-[var(--muted)]">
              Internet-ID: {entry.internetIdServer}
              {entry.internetIdPort ? `:${entry.internetIdPort}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {mikrotikGateway ? (
            <MikrotikWebFigButton gatewayUrl={mikrotikGateway} />
          ) : openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              <ExternalLink size={14} />
              {openLabel}
            </a>
          ) : categoryId === "mikrotik" ? (
            <span className="rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs text-[var(--muted)]">
              Укажите url в credentials
            </span>
          ) : null}
          {(entry.links ?? []).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                link.primary
                  ? "border border-violet-500/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                  : "border border-[var(--card-border)] text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {link.primary ? <Download size={14} /> : <ExternalLink size={14} />}
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {(entry.username || entry.password) && (
        <div className="mt-3 space-y-2">
          {entry.username && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--card)] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Логин
                </p>
                <p className="truncate font-mono text-sm">{entry.username}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy("user", entry.username!)}
                className="rounded-md p-1.5 text-[var(--muted)] transition hover:bg-[var(--card-border)] hover:text-foreground"
                title="Копировать логин"
              >
                {copied === "user" ? (
                  <Check size={14} className="text-emerald-400" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          )}
          {entry.password && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--card)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Пароль
                </p>
                <p className="truncate font-mono text-sm">
                  {showPassword ? entry.password : "••••••••"}
                </p>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="rounded-md p-1.5 text-[var(--muted)] transition hover:bg-[var(--card-border)] hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy("pass", entry.password!)}
                  className="rounded-md p-1.5 text-[var(--muted)] transition hover:bg-[var(--card-border)] hover:text-foreground"
                >
                  {copied === "pass" ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeaturedCard({ entry }: { entry: CredentialEntry }) {
  const actionLinks = entry.links ?? [];
  const primaryLink = actionLinks.find((l) => l.primary) ?? actionLinks[0];
  const secondaryLinks = actionLinks.filter((l) => l !== primaryLink);
  const isDesktopRms = entry.tags?.includes("desktop");

  return (
    <div className="relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-[var(--card)] to-[var(--card)] p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300">
            <Monitor size={28} />
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-violet-300/80">
              Быстрый доступ
            </p>
            <h3 className="mt-1 text-2xl font-bold">{entry.label}</h3>
            {entry.note && (
              <p className="mt-2 max-w-lg text-sm text-[var(--muted)]">{entry.note}</p>
            )}
          </div>
        </div>
        {primaryLink && (
          <a
            href={primaryLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-400"
          >
            <Download size={18} />
            {primaryLink.label}
          </a>
        )}
      </div>

      {isDesktopRms && (
        <ol className="relative mt-6 space-y-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 text-sm text-[var(--muted)]">
          <li>1. Скачайте и установите <strong className="text-foreground">RMS Viewer</strong> (Windows)</li>
          <li>2. Войдите с логином и паролем ниже (или укажите в настройках соединения)</li>
          <li>3. Добавьте соединение → укажите <strong className="text-foreground">Internet-ID</strong> компьютера с монитором</li>
          <li>4. Подключитесь — экран откроется в программе, не в браузере</li>
        </ol>
      )}

      {secondaryLinks.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {secondaryLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:text-foreground"
            >
              <ExternalLink size={14} />
              {link.label}
            </a>
          ))}
        </div>
      )}

      <div className="relative mt-6 max-w-xl">
        <CredentialRow entry={{ ...entry, links: undefined }} compact />
      </div>
    </div>
  );
}

function CategoryBlock({
  category,
  defaultOpen,
}: {
  category: CredentialCategory;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = ICONS[category.icon] ?? Server;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-[var(--background)]/50"
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
        <div className="grid gap-3 border-t border-[var(--card-border)] p-4 sm:grid-cols-2">
          {category.entries.map((entry) => (
            <CredentialRow key={entry.id} entry={entry} categoryId={category.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CredentialsPanel({ pin }: Props) {
  const [store, setStore] = useState<CredentialsStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (pin) headers["x-app-pin"] = pin;

      const res = await fetch("/api/credentials", {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as CredentialsStore & {
        ok?: boolean;
        message?: string;
      };

      if (!res.ok) {
        setError(data.message ?? "Не удалось загрузить доступы");
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
    if (!q) return store;

    const match = (e: CredentialEntry) =>
      [e.label, e.username, e.host, e.note, e.url, ...(e.tags ?? [])]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));

    return {
      ...store,
      featured: store.featured?.filter(match),
      categories: store.categories
        .map((c) => ({ ...c, entries: c.entries.filter(match) }))
        .filter((c) => c.entries.length > 0),
    };
  }, [store, query]);

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
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: офис, RMS, принтер, сервер…"
          className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-[var(--accent)]"
        />
      </div>

      {filtered.featured?.map((entry) => (
        <FeaturedCard key={entry.id} entry={entry} />
      ))}

      <div className="space-y-3">
        {filtered.categories.map((category, i) => (
          <CategoryBlock key={category.id} category={category} defaultOpen={i === 0} />
        ))}
      </div>

      {filtered.categories.length === 0 && !filtered.featured?.length && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Ничего не найдено</p>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Данные в{" "}
        <code className="rounded bg-[var(--card)] px-1.5 py-0.5">.data/credentials.json</code> — не
        в git
      </p>
    </div>
  );
}
