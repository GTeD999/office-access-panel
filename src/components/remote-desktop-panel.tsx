"use client";

import { ExternalLink, Monitor, Download } from "lucide-react";

const GUACAMOLE_URL = process.env.NEXT_PUBLIC_GUACAMOLE_URL?.replace(/\/$/, "");

export default function RemoteDesktopPanel() {
  if (GUACAMOLE_URL) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Удалённые экраны</h2>
            <p className="text-sm text-[var(--muted)]">
              RDP/VNC через Apache Guacamole — прямо в браузере
            </p>
          </div>
          <a
            href={GUACAMOLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
          >
            Открыть в новой вкладке
            <ExternalLink size={14} />
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-black">
          <iframe
            title="Guacamole — удалённый рабочий стол"
            src={GUACAMOLE_URL}
            className="h-[min(75vh,720px)] w-full"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
        <h2 className="text-lg font-semibold text-amber-100">RMS нельзя встроить в браузер</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-100/85">
          TektonIT RMS — только программа <strong>Viewer для Windows</strong>. У неё нет веб-версии
          и API для встраивания в сайт. Кнопка «открыть RMS в браузере» технически невозможна.
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Monitor size={24} />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Как встроить экраны в эту панель</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Нужен шлюз <strong className="text-foreground">Apache Guacamole</strong> на вашем
              сервере (например VM Webserver). Он переводит RDP/VNC в HTML5 — тогда экран
              мониторов откроется прямо здесь, в iframe.
            </p>
          </div>
        </div>

        <ol className="mt-6 space-y-3 text-sm text-[var(--muted)]">
          <li className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <span className="font-medium text-foreground">1. На ПК с мониторами</span> — включить
            RDP (удалённый рабочий стол) или VNC, либо оставить RMS Host (Guacamole подключается
            по RDP/VNC, не через RMS).
          </li>
          <li className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <span className="font-medium text-foreground">2. На сервере</span> — установить{" "}
            <a
              href="https://guacamole.apache.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Apache Guacamole
            </a>{" "}
            + HTTPS.
          </li>
          <li className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <span className="font-medium text-foreground">3. В .env.local</span> добавить{" "}
            <code className="rounded bg-[var(--card)] px-1.5 py-0.5 text-xs">
              NEXT_PUBLIC_GUACAMOLE_URL=https://ваш-сервер/guacamole
            </code>{" "}
            — появится вкладка с экраном внутри панели.
          </li>
        </ol>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="https://rmansys.ru/files/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20"
          >
            <Download size={16} />
            RMS Viewer (как сейчас)
          </a>
          <a
            href="https://guacamole.apache.org/doc/gug/guacamole-docker.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
          >
            <ExternalLink size={16} />
            Guacamole — инструкция
          </a>
        </div>
      </div>
    </div>
  );
}
