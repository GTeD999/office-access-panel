"use client";

import type {
  AccountsStatus,
  AvitoAccountStatus,
  CianAccountStatus,
  YandexMailUser,
} from "@/lib/accounts/types";
import { fetchJson } from "@/lib/fetch-json";
import {
  Copy,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Power,
  RefreshCw,
  Shield,
  UserX,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function ServiceCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <div className="border-b border-[var(--card-border)] px-5 py-4">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs transition hover:bg-[var(--background)]"
    >
      <ExternalLink size={14} />
      {label}
    </a>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs transition hover:bg-[var(--card-border)]"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
      {label}
    </button>
  );
}

function AvitoCard({ account }: { account: AvitoAccountStatus }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{account.label}</p>
          {account.login && <p className="text-sm text-[var(--muted)]">{account.login}</p>}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            account.mode === "api" && account.connected
              ? "bg-emerald-500/15 text-emerald-400"
              : account.connected
                ? "bg-blue-500/15 text-blue-300"
                : "bg-zinc-500/15 text-zinc-400"
          }`}
        >
          {account.mode === "api" && account.connected
            ? "API"
            : account.connected
              ? "кабинет"
              : "настроить"}
        </span>
      </div>

      {account.mode === "api" && account.connected && (
        <div className="mt-3 space-y-1 text-sm">
          {account.name && <p>{account.name}</p>}
          {account.balance !== undefined && (
            <p className="flex items-center gap-2 font-medium text-emerald-300">
              <Wallet size={16} />
              {account.balance.toLocaleString("ru-RU")} ₽
              {account.bonus !== undefined && (
                <span className="text-[var(--muted)]">+ {account.bonus} бонус</span>
              )}
            </p>
          )}
        </div>
      )}

      {account.mode === "manual" && account.login && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyField label="Логин" value={account.login} />
          {account.password && (
            <>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs"
              >
                <KeyRound size={14} />
                {showPassword ? account.password : "••••••••"}
              </button>
              <CopyField label="Пароль" value={account.password} />
            </>
          )}
        </div>
      )}

      {(account.error || account.hint) && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {account.error ?? account.hint}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={account.links.cabinet} label="Кабинет" />
        <LinkButton href={account.links.balance} label="Баланс" />
        <LinkButton href={account.links.changePassword} label="Сменить пароль" />
        <LinkButton href={account.links.logoutDevices} label="Выйти везде" />
      </div>
    </div>
  );
}

function CianCard({ account }: { account: CianAccountStatus }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{account.label}</p>
          {account.login && <p className="text-sm text-[var(--muted)]">{account.login}</p>}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            account.mode === "api" && account.connected
              ? "bg-emerald-500/15 text-emerald-400"
              : account.connected
                ? "bg-blue-500/15 text-blue-300"
                : "bg-zinc-500/15 text-zinc-400"
          }`}
        >
          {account.mode === "api" && account.connected
            ? "API"
            : account.connected
              ? "кабинет"
              : "настроить"}
        </span>
      </div>

      {account.mode === "api" && account.balance !== undefined && (
        <p className="mt-3 flex items-center gap-2 font-medium text-emerald-300">
          <Wallet size={16} />
          {account.balance.toLocaleString("ru-RU")} ₽
        </p>
      )}

      {account.mode === "manual" && account.login && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyField label="Логин" value={account.login} />
          {account.password && (
            <>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs"
              >
                <KeyRound size={14} />
                {showPassword ? account.password : "••••••••"}
              </button>
              <CopyField label="Пароль" value={account.password} />
            </>
          )}
        </div>
      )}

      {(account.error || account.hint) && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {account.error ?? account.hint}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={account.links.cabinet} label="Кабинет" />
        <LinkButton href={account.links.apiSettings} label="API-ключ" />
        <LinkButton href={account.links.changePassword} label="Сменить пароль" />
        <LinkButton href={account.links.logoutDevices} label="Выйти везде" />
      </div>
    </div>
  );
}

function YandexUserRow({
  user,
  busy,
  canResetPassword,
  canLogout,
  canDisable,
  onResetPassword,
  onLogoutAll,
  onToggleEnabled,
}: {
  user: YandexMailUser;
  busy: boolean;
  canResetPassword: boolean;
  canLogout: boolean;
  canDisable: boolean;
  onResetPassword: (user: YandexMailUser) => void;
  onLogoutAll: (user: YandexMailUser) => void;
  onToggleEnabled: (userId: string, enabled: boolean) => void;
}) {
  return (
    <tr className="border-t border-[var(--card-border)]">
      <td className="px-3 py-2">
        <p className="font-medium">{user.name}</p>
        <p className="font-mono text-xs text-[var(--muted)]">{user.email}</p>
      </td>
      <td className="hidden px-3 py-2 text-sm text-[var(--muted)] md:table-cell">
        {user.position ?? "—"}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              user.isEnabled && !user.isDismissed
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {user.isDismissed
              ? "уволен"
              : user.isRobot
                ? "робот"
                : user.isEnabled
                  ? "активен"
                  : "отключён"}
          </span>
          {user.isAdmin && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
              админ
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy || !canResetPassword}
            onClick={() => onResetPassword(user)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs disabled:opacity-40"
            title={
              canResetPassword
                ? "Сменить пароль и завершить сессии"
                : "Нельзя сменить пароль роботу или уволенному"
            }
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
            Пароль
          </button>
          <button
            type="button"
            disabled={busy || !canLogout}
            onClick={() => onLogoutAll(user)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs disabled:opacity-40"
            title={
              canLogout
                ? "Выйти из почты на всех устройствах"
                : "Нельзя для робота или уволенного"
            }
          >
            <LogOut size={12} />
            Выйти везде
          </button>
          {canDisable && user.isEnabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleEnabled(user.id, false)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 disabled:opacity-40"
              title="Отключить учётку — сброс сессий"
            >
              <UserX size={12} />
              Откл.
            </button>
          ) : canDisable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleEnabled(user.id, true)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300 disabled:opacity-40"
            >
              <Shield size={12} />
              Вкл.
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

type PasswordChangeRecord = {
  id: string;
  email: string;
  name: string;
  password: string;
  passwordChangeRequired: boolean;
  changedAt: string;
};

type PasswordModalSuccess = {
  password: string;
  email: string;
  name: string;
  passwordChangeRequired: boolean;
};

function PasswordModal({
  user,
  loading,
  success,
  onClose,
  onSubmit,
}: {
  user: YandexMailUser;
  loading: boolean;
  success: PasswordModalSuccess | null;
  onClose: () => void;
  onSubmit: (options: {
    password: string | null;
    passwordChangeRequired: boolean;
  }) => void;
}) {
  const [password, setPassword] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [requireChangeOnLogin, setRequireChangeOnLogin] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(true);

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-[var(--card)] p-6 shadow-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-emerald-300">Пароль изменён</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{success.name}</p>
              <p className="font-mono text-xs text-cyan-300/80">{success.email}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--background)]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Новый пароль</p>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs text-[var(--muted)] hover:text-foreground"
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
            <code className="block break-all font-mono text-lg text-emerald-300">
              {showPassword ? success.password : "••••••••••••"}
            </code>
          </div>

          <p className="mb-5 text-xs text-[var(--muted)]">
            {success.passwordChangeRequired
              ? "При следующем входе Яндекс попросит сменить пароль."
              : "Пароль можно использовать сразу, без принудительной смены при входе."}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(success.password);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              Копировать
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Смена пароля</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{user.name}</p>
            <p className="font-mono text-xs text-cyan-300/80">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoGenerate}
            onChange={(e) => setAutoGenerate(e.target.checked)}
            className="rounded"
          />
          Сгенерировать надёжный пароль автоматически
        </label>

        {!autoGenerate && (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs text-[var(--muted)]">Новый пароль</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        <label className="mb-5 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={requireChangeOnLogin}
            onChange={(e) => setRequireChangeOnLogin(e.target.checked)}
            className="mt-0.5 rounded"
          />
          <span>
            Требовать смену пароля при следующем входе
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Снимите галочку, если пользователь должен войти с этим паролем без дополнительной смены
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={loading || (!autoGenerate && password.trim().length < 8)}
            onClick={() =>
              onSubmit({
                password: autoGenerate ? null : password.trim(),
                passwordChangeRequired: requireChangeOnLogin,
              })
            }
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Сменить пароль
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentPasswordsPanel({
  records,
  onClear,
}: {
  records: PasswordChangeRecord[];
  onClear: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  if (records.length === 0) return null;

  return (
    <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-emerald-300">Сменённые пароли (эта сессия)</h4>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-[var(--muted)] hover:text-foreground"
        >
          Очистить список
        </button>
      </div>
      <div className="space-y-2">
        {records.map((record) => {
          const visible = visibleIds.has(record.id);
          return (
            <div
              key={`${record.id}-${record.changedAt}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/80 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{record.name}</p>
                <p className="truncate font-mono text-xs text-[var(--muted)]">{record.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-black/30 px-2 py-1 font-mono text-sm text-emerald-300">
                  {visible ? record.password : "••••••••••••"}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(record.id)) next.delete(record.id);
                      else next.add(record.id);
                      return next;
                    })
                  }
                  className="rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs"
                >
                  {visible ? "Скрыть" : "Показать"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(record.password);
                    if (ok) {
                      setCopiedId(record.id);
                      setTimeout(() => setCopiedId(null), 1500);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-xs"
                >
                  {copiedId === record.id ? <Check size={12} /> : <Copy size={12} />}
                  Копировать
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountsPanel({ pin }: Props) {
  const [status, setStatus] = useState<AccountsStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "error">("ok");
  const [query, setQuery] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordMeta, setPasswordMeta] = useState<{ email?: string; name?: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<YandexMailUser | null>(null);
  const [passwordModalSuccess, setPasswordModalSuccess] =
    useState<PasswordModalSuccess | null>(null);
  const [recentPasswords, setRecentPasswords] = useState<PasswordChangeRecord[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const headers: Record<string, string> = {};
      if (pin) headers["x-app-pin"] = pin;

      setStatus(
        await fetchJson<AccountsStatus>("/api/accounts", { cache: "no-store", headers }, 45_000),
      );
    } catch {
      setMessage("Не удалось загрузить аккаунты");
      setMessageTone("error");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [pin]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  async function runAction(payload: Record<string, unknown>) {
    const actionKey = payload.userId
      ? `${String(payload.action)}${String(payload.userId)}`
      : String(payload.action);
    setActionLoading(actionKey);
    setMessage(null);
    setGeneratedPassword(null);
    setPasswordMeta(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pin) headers["x-app-pin"] = pin;

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      let data: {
        ok: boolean;
        message: string;
        data?: { password?: string; email?: string; name?: string };
      };

      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = { ok: false, message: `Ошибка сервера (HTTP ${res.status})` };
      }

      setMessage(data.message);
      setMessageTone(data.ok ? "ok" : "error");
      if (data.data?.password) {
        setGeneratedPassword(data.data.password);
        setPasswordMeta({ email: data.data.email, name: data.data.name });
      }
      if (data.ok) {
        if (payload.action !== "reset-password") {
          setPasswordTarget(null);
          setPasswordModalSuccess(null);
        }
        await load();
      }
    } catch {
      setMessage("Ошибка сети — проверьте подключение");
      setMessageTone("error");
    } finally {
      setActionLoading(null);
    }
  }

  async function submitPasswordChange(options: {
    password: string | null;
    passwordChangeRequired: boolean;
  }) {
    if (!passwordTarget) return;

    const actionKey = `reset-password${passwordTarget.id}`;
    setActionLoading(actionKey);
    setMessage(null);
    setGeneratedPassword(null);
    setPasswordMeta(null);
    setPasswordModalSuccess(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pin) headers["x-app-pin"] = pin;

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider: "yandex360",
          action: "reset-password",
          userId: passwordTarget.id,
          passwordChangeRequired: options.passwordChangeRequired,
          ...(options.password ? { password: options.password } : {}),
        }),
      });

      let data: {
        ok: boolean;
        message: string;
        data?: {
          password?: string;
          email?: string;
          name?: string;
          passwordChangeRequired?: boolean;
        };
      };

      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = { ok: false, message: `Ошибка сервера (HTTP ${res.status})` };
      }

      setMessage(data.message);
      setMessageTone(data.ok ? "ok" : "error");

      if (data.ok && data.data?.password) {
        const record: PasswordChangeRecord = {
          id: passwordTarget.id,
          email: data.data.email ?? passwordTarget.email,
          name: data.data.name ?? passwordTarget.name,
          password: data.data.password,
          passwordChangeRequired: data.data.passwordChangeRequired !== false,
          changedAt: new Date().toISOString(),
        };
        setPasswordModalSuccess({
          password: record.password,
          email: record.email,
          name: record.name,
          passwordChangeRequired: record.passwordChangeRequired,
        });
        setRecentPasswords((prev) => [record, ...prev].slice(0, 15));
        setGeneratedPassword(record.password);
        setPasswordMeta({ email: record.email, name: record.name });
        await load();
      }
    } catch {
      setMessage("Ошибка сети — проверьте подключение");
      setMessageTone("error");
    } finally {
      setActionLoading(null);
    }
  }

  function openPasswordModal(user: YandexMailUser) {
    setPasswordTarget(user);
    setPasswordModalSuccess(null);
  }

  function closePasswordModal() {
    setPasswordTarget(null);
    setPasswordModalSuccess(null);
  }

  const yandexBulkMode =
    (status?.yandex360.manageableActiveCount ?? 0) > 0 ? "off" : "on";

  const yandexUsers = useMemo(() => {
    const users = (status?.yandex360.users ?? []).filter((u) => !u.isRobot);
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.position].filter(Boolean).some((s) => s!.toLowerCase().includes(q)),
    );
  }, [status, query]);

  function canResetPassword(user: YandexMailUser): boolean {
    return !user.isRobot && !user.isDismissed;
  }

  function canDisableUser(user: YandexMailUser): boolean {
    if (user.isRobot || user.isDismissed || user.isAdmin) return false;
    const protectedEmails = new Set([
      "admin@example.com",
      "helpdesk@example.com",
    ]);
    return !protectedEmails.has(user.email.toLowerCase());
  }

  function canLogoutUser(user: YandexMailUser): boolean {
    return !user.isRobot && !user.isDismissed;
  }

  function logoutUserEverywhere(user: YandexMailUser) {
    const ok = window.confirm(
      `Разлогинить ${user.email} на всех устройствах?\n\nСотруднику придётся войти заново. Пароли приложений будут удалены.`,
    );
    if (!ok) return;
    void runAction({
      provider: "yandex360",
      action: "logout-all-devices",
      userId: user.id,
    });
  }

  if (initialLoading && !status) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--muted)]">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Управление аккаунтами</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Avito, Циан, корпоративная почта Яндекс 360
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Обновить
        </button>
      </div>

      {status?.dryRun && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Dry-run: действия с паролями Яндекс не применяются. Задайте ACCOUNTS_DRY_RUN=false
        </div>
      )}

      {message && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            messageTone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/30 bg-red-500/10 text-red-100"
          }`}
        >
          {message}
          {generatedPassword && (
            <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/80 p-4">
              {passwordMeta?.email && (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  {passwordMeta.name} · {passwordMeta.email}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-black/30 px-3 py-2 font-mono text-base text-emerald-300">
                  {generatedPassword}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(generatedPassword);
                    if (ok) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  Копировать пароль
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {passwordTarget && (
        <PasswordModal
          user={passwordTarget}
          success={passwordModalSuccess}
          loading={actionLoading === `reset-password${passwordTarget.id}`}
          onClose={closePasswordModal}
          onSubmit={(options) => void submitPasswordChange(options)}
        />
      )}

      {(status?.avito.length ?? 0) > 0 && (
        <ServiceCard title="Avito">
          <p className="col-span-full -mt-1 mb-1 text-xs text-[var(--muted)]">
            API не обязателен — без платного тарифа используйте логин/пароль и кнопки в кабинет.
          </p>
          {status!.avito.map((a) => (
            <AvitoCard key={a.id} account={a} />
          ))}
        </ServiceCard>
      )}

      {(status?.cian.length ?? 0) > 0 && (
        <ServiceCard title="Циан">
          {status!.cian.map((c) => (
            <CianCard key={c.id} account={c} />
          ))}
        </ServiceCard>
      )}


      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-[var(--accent)]" />
            <div>
              <h3 className="font-semibold">Яндекс 360 — почта @example.com</h3>
              <p className="text-sm text-[var(--muted)]">
                {status?.yandex360.connected
                  ? `${status.yandex360.totalUsers} сотрудников`
                  : "Требуется OAuth-токен администратора"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status?.yandex360.connected && (
              <>
                <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--muted)]">
                  активных: {status.yandex360.manageableActiveCount}
                </span>
                <button
                  type="button"
                  disabled={!!actionLoading}
                  onClick={() =>
                    void runAction({
                      provider: "yandex360",
                      action: yandexBulkMode === "off" ? "bulk-off" : "bulk-on",
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    yandexBulkMode === "off"
                      ? "border-red-500/35 text-red-300"
                      : "border-emerald-500/35 text-emerald-300"
                  }`}
                >
                  {actionLoading?.startsWith("bulk-") ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Power size={14} />
                  )}
                  {yandexBulkMode === "off" ? "Отключить всех" : "Включить всех"}
                </button>
              </>
            )}
            {status?.yandex360.links.admin && (
              <LinkButton href={status.yandex360.links.admin} label="Админка" />
            )}
          </div>
        </div>

        {(status?.yandex360.error || status?.yandex360.hint) && (
          <p className="border-b border-[var(--card-border)] px-5 py-3 text-sm text-amber-300/90">
            {status.yandex360.error ?? status.yandex360.hint}
          </p>
        )}

        {status?.yandex360.connected && (
          <>
            <RecentPasswordsPanel
              records={recentPasswords}
              onClear={() => setRecentPasswords([])}
            />
            <div className="border-b border-[var(--card-border)] px-5 py-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск сотрудника по имени или email…"
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-[var(--background)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Сотрудник</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Должность</th>
                    <th className="px-3 py-2 font-medium">Статус</th>
                    <th className="px-3 py-2 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {yandexUsers.map((user) => (
                    <YandexUserRow
                      key={user.id}
                      user={user}
                      canResetPassword={canResetPassword(user)}
                      canLogout={canLogoutUser(user)}
                      canDisable={canDisableUser(user)}
                      busy={
                        actionLoading === `disable${user.id}` ||
                        actionLoading === `enable${user.id}` ||
                        actionLoading === `reset-password${user.id}` ||
                        actionLoading === `logout-all-devices${user.id}`
                      }
                      onResetPassword={openPasswordModal}
                      onLogoutAll={logoutUserEverywhere}
                      onToggleEnabled={(userId, enabled) =>
                        void runAction({
                          provider: "yandex360",
                          action: enabled ? "enable" : "disable",
                          userId,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[var(--card-border)] px-5 py-3 text-xs text-[var(--muted)]">
              <LogOut size={12} className="mr-1 inline" />
              «Пароль» и «Выйти везде» — для всех активных сотрудников. «Откл.» — не для админов и
              admin@example.com / helpdesk. «Отключить всех» не трогает администраторов.
            </p>
          </>
        )}
      </section>

      <p className="text-center text-xs text-[var(--muted)]">
        Пароли подтягиваются из хранилища. Avito API — только при платном тарифе (необязательно).
      </p>
    </div>
  );
}
