"use client";

import { Lock, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";

const REMEMBER_KEY = "novactiv_remember";
const SECRET_KEY = "novactiv_device_secret";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const autoLoginAttempted = useRef(false);

  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doLogin = useCallback(
    async (phrase: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: phrase }),
        });
        const data = (await response.json()) as { ok?: boolean; message?: string };
        if (!response.ok || !data.ok) {
          setError(data.message ?? "Неверная фраза");
          return false;
        }

        if (remember) {
          localStorage.setItem(REMEMBER_KEY, "1");
          localStorage.setItem(SECRET_KEY, phrase);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(SECRET_KEY);
        }

        router.replace(next);
        router.refresh();
        return true;
      } catch {
        setError("Ошибка сети");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [remember, router, next],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const session = await fetch("/api/auth/session");
        const data = (await session.json()) as { authenticated?: boolean };
        if (!cancelled && data.authenticated) {
          router.replace(next);
          return;
        }
      } catch {
        // продолжаем к форме входа
      }

      const shouldRemember = localStorage.getItem(REMEMBER_KEY) === "1";
      const saved = localStorage.getItem(SECRET_KEY) ?? "";
      if (shouldRemember && saved) {
        setRemember(true);
        setSecret(saved);
        if (!autoLoginAttempted.current) {
          autoLoginAttempted.current = true;
          await doLogin(saved);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [doLogin, next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await doLogin(secret);
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[var(--accent)]/15 p-3 text-[var(--accent)]">
            <Lock size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Novactiv Access</h1>
            <p className="text-sm text-[var(--muted)]">Секретная фраза панели</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--muted)]">
              ACCESS_SECRET
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Фраза из .env.local"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-[var(--card-border)]"
            />
            Запомнить на этом устройстве (автовход)
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || secret.length < 8}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Войти
          </button>
        </form>

        <div className="mt-6 space-y-2 text-xs leading-relaxed text-[var(--muted)]">
          <p>
            <strong className="text-foreground">Панель и API:</strong> без фразы или сессии
            никто не откроет сайт, пароли MikroTik/Bitrix из хранилища и WebFig через панель.
          </p>
          <p>
            <strong className="text-foreground">Direct router access</strong>:
            requires whitelisted IP and router credentials (panel passphrase does not apply).
          </p>
          <p>
            Сессия после входа — 90 дней. «Запомнить» хранит фразу только в браузере этого Mac.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center">
          <Loader2 className="animate-spin text-[var(--muted)]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
