"use client";

import EmployeeCredentialsCard from "@/components/employee-credentials-card";
import type {
  EmailCheckResult,
  RegistrationResult,
  RegistrationStatus,
  RegistrationStepResult,
} from "@/lib/registration/types";
import {
  CheckCircle2,
  FolderOpen,
  Loader2,
  Mail,
  RefreshCw,
  Server,
  Shield,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  pin: string;
  embedded?: boolean;
};

function generatePassword(length = 14): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function StepRow({ step }: { step: RegistrationStepResult }) {
  const Icon = step.skipped ? Shield : step.ok ? CheckCircle2 : XCircle;
  const color = step.skipped
    ? "text-zinc-400"
    : step.ok
      ? "text-emerald-400"
      : "text-red-400";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3">
      <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{step.label}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{step.message}</p>
      </div>
    </div>
  );
}

export default function RegistrationPanel({ pin, embedded = false }: Props) {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailCheck, setEmailCheck] = useState<EmailCheckResult | null>(null);
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [position, setPosition] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [bitrixDepartmentId, setBitrixDepartmentId] = useState<number | "">("");
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(true);
  const [createYandex, setCreateYandex] = useState(true);
  const [createAd, setCreateAd] = useState(true);
  const [createBitrix, setCreateBitrix] = useState(true);
  const [createFolder, setCreateFolder] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (pin) h["x-app-pin"] = pin;
    return h;
  }, [pin]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/registration", {
        headers: pin ? { "x-app-pin": pin } : {},
        signal: AbortSignal.timeout(45_000),
      });
      const data = (await res.json()) as RegistrationStatus;
      setStatus(data);
      if (!departmentId && data.departments?.[0]?.id) {
        setDepartmentId(data.departments[0].id);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [pin, departmentId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const selectedDepartment = status?.departments.find((d) => d.id === departmentId);
  const selectedBitrixDepartment = status?.bitrixDepartments.find(
    (d) => d.id === bitrixDepartmentId,
  );

  useEffect(() => {
    if (selectedDepartment?.bitrixDepartmentId == null) return;
    setBitrixDepartmentId(selectedDepartment.bitrixDepartmentId);
  }, [selectedDepartment?.id, selectedDepartment?.bitrixDepartmentId]);

  async function checkEmail() {
    if (!email.includes("@")) return;
    setCheckingEmail(true);
    setEmailCheck(null);
    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "check-email", email }),
      });
      setEmailCheck((await res.json()) as EmailCheckResult);
    } finally {
      setCheckingEmail(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          middleName: middleName || undefined,
          birthDate: birthDate || undefined,
          position: position || undefined,
          departmentId,
          bitrixDepartmentId: createBitrix && bitrixDepartmentId !== "" ? bitrixDepartmentId : undefined,
          createYandex,
          createAd,
          createBitrix,
          createFolder,
          passwordChangeRequired,
        }),
      });
      const data = (await res.json()) as RegistrationResult;
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)]">
        {!embedded && (
        <div className="border-b border-[var(--card-border)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Регистрация сотрудника</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Яндекс 360 → Active Directory → Bitrix24 → cloud.example.com
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchStatus()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm transition hover:border-[var(--accent)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Обновить
            </button>
          </div>
        </div>
        )}

        <div className={`space-y-4 ${embedded ? "p-6 sm:p-8" : "p-6 sm:p-8"}`}>
          {embedded && (
            <div className="mb-2">
              <h3 className="text-lg font-semibold">Регистрация сотрудника</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Яндекс 360 → Active Directory → Bitrix24 → cloud.example.com · логин = часть email до @
              </p>
            </div>
          )}
          {status?.dryRun && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Dry-run: регистрация только симулируется. Для реального создания задайте{" "}
              <code className="text-amber-100">REGISTRATION_DRY_RUN=false</code> в .env.local
            </div>
          )}

          {status?.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {status.error}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">
                  Подразделение (Active Directory) <span className="text-red-400">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="" disabled>
                    {loading ? "Загрузка…" : "Выберите подразделение AD"}
                  </option>
                  {(status?.departments ?? []).map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.memberCount ?? 0} чел.)
                    </option>
                  ))}
                </select>
                {selectedDepartment && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    В OU: {selectedDepartment.memberCount ?? 0} сотрудников
                    {selectedDepartment.yandexDepartmentId != null &&
                      ` · Yandex #${selectedDepartment.yandexDepartmentId}`}
                  </p>
                )}
              </div>

              {createBitrix && (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium">
                    Отдел Bitrix24 <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={bitrixDepartmentId}
                    onChange={(e) =>
                      setBitrixDepartmentId(e.target.value ? Number(e.target.value) : "")
                    }
                    required={createBitrix}
                    className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                  >
                    <option value="" disabled>
                      {loading ? "Загрузка…" : "Выберите отдел Bitrix24"}
                    </option>
                    {(status?.bitrixDepartments ?? []).map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} (#{dept.id}
                        {dept.memberCount != null ? ` · ${dept.memberCount} чел.` : ""})
                      </option>
                    ))}
                  </select>
                  {selectedBitrixDepartment && (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      При смене AD-подразделения подставляется рекомендуемый отдел Bitrix — можно
                      изменить вручную.
                    </p>
                  )}
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">
                  Email <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailCheck(null);
                    }}
                    onBlur={() => void checkEmail()}
                    placeholder="ivanov@example.com"
                    required
                    className="min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => void checkEmail()}
                    disabled={checkingEmail || !email.includes("@")}
                    className="shrink-0 rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {checkingEmail ? <Loader2 size={16} className="animate-spin" /> : "Проверить"}
                  </button>
                </div>
                {emailCheck && (
                  <p
                    className={`mt-2 text-xs ${emailCheck.ok ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {emailCheck.ok
                      ? "Email свободен"
                      : emailCheck.messages.join(" · ")}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Имя <span className="text-red-400">*</span>
                </label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Фамилия <span className="text-red-400">*</span>
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Отчество</label>
                <input
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Дата рождения</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Должность</label>
                <input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Менеджер по продажам"
                  className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">
                  Пароль <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 font-mono text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => setPassword(generatePassword())}
                    className="shrink-0 rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm transition hover:border-[var(--accent)]"
                  >
                    Сгенерировать
                  </button>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={passwordChangeRequired}
                    onChange={(e) => setPasswordChangeRequired(e.target.checked)}
                    className="rounded border-[var(--card-border)]"
                  />
                  Требовать смену пароля при первом входе (Яндекс)
                </label>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">Создать учётки в</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { key: "yandex", checked: createYandex, set: setCreateYandex, label: "Яндекс 360", icon: Mail },
                  { key: "ad", checked: createAd, set: setCreateAd, label: "Active Directory", icon: Server },
                  { key: "bitrix", checked: createBitrix, set: setCreateBitrix, label: "Bitrix24", icon: Shield },
                  { key: "folder", checked: createFolder, set: setCreateFolder, label: "Сетевая папка (cloud.example.com)", icon: FolderOpen },
                ].map(({ key, checked, set, label, icon: Icon }) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                        : "border-[var(--card-border)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => set(e.target.checked)}
                      className="rounded border-[var(--card-border)]"
                    />
                    <Icon size={16} className="text-[var(--muted)]" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || loading || !departmentId || (createBitrix && bitrixDepartmentId === "")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3.5 font-medium text-white transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <UserPlus size={18} />
              )}
              Зарегистрировать сотрудника
            </button>
          </form>
        </div>
      </section>

      {result && (
        <section
          className={`rounded-2xl border p-5 ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <p className={`font-medium ${result.ok ? "text-emerald-200" : "text-red-200"}`}>
            {result.message}
          </p>

          {result.data && (
            <div className="mt-4">
              <EmployeeCredentialsCard data={result.data} title="Данные сотрудника" />
            </div>
          )}

          {result.steps.length > 0 && (
            <div className="mt-4 grid gap-2">
              {result.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </div>
          )}
        </section>
      )}

      {status?.hints && status.hints.length > 0 && (
        <p className="text-xs leading-relaxed text-[var(--muted)]">{status.hints.join(" ")}</p>
      )}
    </div>
  );
}
