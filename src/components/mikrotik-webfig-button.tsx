"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

const REMEMBER_KEY = "novactiv_mikrotik_gate_remember";
const SECRET_KEY = "novactiv_mikrotik_gate_secret";

type Props = {
  gatewayUrl: string;
  label?: string;
};

export function MikrotikWebFigButton({ gatewayUrl, label = "Открыть WebFig" }: Props) {
  const [loading, setLoading] = useState(false);

  async function tryUnlock(secret: string): Promise<boolean> {
    const response = await fetch("/api/mikrotik/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    const data = (await response.json()) as { ok?: boolean };
    return response.ok && Boolean(data.ok);
  }

  async function handleOpen() {
    setLoading(true);
    try {
      const status = await fetch("/api/mikrotik/gate-status");
      const data = (await status.json()) as { required?: boolean; unlocked?: boolean };

      if (!data.required || data.unlocked) {
        window.open(gatewayUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const remembered =
        localStorage.getItem(REMEMBER_KEY) === "1"
          ? localStorage.getItem(SECRET_KEY) ?? ""
          : "";

      if (remembered && (await tryUnlock(remembered))) {
        window.open(gatewayUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const returnParam = encodeURIComponent(gatewayUrl);
      window.open(`/mikrotik-unlock?return=${returnParam}`, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:opacity-50"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
      {label}
    </button>
  );
}
