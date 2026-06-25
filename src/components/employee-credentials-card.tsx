"use client";

import type { StoredEmployeeCredentials } from "@/lib/registration/types";
import { resolveDisplayName } from "@/lib/registration/display-name";
import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

type Props = {
  data: StoredEmployeeCredentials;
  title?: string;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="break-all font-mono text-sm">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--card-border)] px-2.5 py-1 text-xs transition hover:border-[var(--accent)] sm:mt-0"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        Копировать
      </button>
    </div>
  );
}

export default function EmployeeCredentialsCard({ data, title = "Данные для входа" }: Props) {
  const [copiedAll, setCopiedAll] = useState(false);
  const fullName = resolveDisplayName(data);

  const allText = [
    fullName ? `ФИО: ${fullName}` : null,
    `Email: ${data.email}`,
    `Логин (ПК / cloud): ${data.login}`,
    `AD UPN: ${data.adUpn}`,
    `Пароль: ${data.password}`,
    `Cloud: ${data.cloudUser}`,
    `Папка: ${data.cloudFolder}`,
    data.departmentName ? `Подразделение: ${data.departmentName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-[var(--accent)]" />
          <p className="font-medium">{title}</p>
          {data.dryRun && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
              dry-run
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(allText);
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 1500);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--card)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
        >
          {copiedAll ? <Check size={14} /> : <Copy size={14} />}
          Скопировать всё
        </button>
      </div>

      <div className="grid gap-3">
        {fullName && <CopyRow label="ФИО" value={fullName} />}
        <CopyRow label="Email (Яндекс / Bitrix)" value={data.email} />
        <CopyRow label="Логин — вход в ПК и cloud" value={data.login} />
        <CopyRow label="AD UPN" value={data.adUpn} />
        <CopyRow label="Пароль" value={data.password} />
        <CopyRow label="Cloud" value={data.cloudUser} />
        <CopyRow label="Сетевая папка" value={data.cloudFolder} />
        {data.departmentName && <CopyRow label="Подразделение" value={data.departmentName} />}
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Сохранено: {new Date(data.updatedAt).toLocaleString("ru-RU")}
      </p>
    </div>
  );
}
