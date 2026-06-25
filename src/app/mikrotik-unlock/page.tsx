"use client";

import { Loader2, Lock, Router } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

const REMEMBER_KEY = "novactiv_mikrotik_gate_remember";
const SECRET_KEY = "novactiv_mikrotik_gate_secret";

function UnlockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("return") || "/";

  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(REMEMBER_KEY) === "1") {
      const saved = localStorage.getItem(SECRET_KEY);
      if (saved) setSecret(saved);
    }
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mikrotik/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message ?? "Неверная фраза");
        return;
      }

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, "1");
        localStorage.setItem(SECRET_KEY, secret);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(SECRET_KEY);
      }

      if (returnUrl.startsWith("/api/mikrotik/gateway")) {
        window.location.href = returnUrl;
      } else if (returnUrl.startsWith("http")) {
        window.location.href = returnUrl;
      } else {
        router.replace(returnUrl);
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[var(--accent)]/15 p-3 text-[var(--accent)]">
            <Router size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Доступ к MikroTik</h1>
            <p className="text-sm text-[var(--muted)]">Фраза нужна даже при знании логина и пароля</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-[var(--muted)]">
              MIKROTIK_GATE_SECRET
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
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
            Запомнить на этом Mac
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || secret.length < 8}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Разблокировать WebFig
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
          Панель открывается без фразы. WebFig — только с фразой. Прямой вход на роутер по IP
          дополнительно режется firewall (Вьетнам + whitelist).
        </p>
      </div>
    </div>
  );
}

export default function MikrotikUnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center">
          <Loader2 className="animate-spin text-[var(--muted)]" />
        </div>
      }
    >
      <UnlockForm />
    </Suspense>
  );
}
