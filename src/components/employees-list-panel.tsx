"use client";

import { fetchJson } from "@/lib/fetch-json";
import EmployeeCredentialsCard from "@/components/employee-credentials-card";
import type {
  EmployeeListResult,
  EmployeeRecord,
  EmployeeServices,
  RegistrationResult,
  RegistrationStatus,
  StoredEmployeeCredentials,
} from "@/lib/registration/types";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Server,
  Shield,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";

type Props = {
  pin: string;
  onGoRegister?: () => void;
};

type ServiceKey = keyof EmployeeServices;

const SERVICE_COLUMNS: Array<{
  key: ServiceKey;
  label: string;
  short: string;
  icon: React.ElementType;
}> = [
  { key: "yandex", label: "Яндекс 360", short: "Yandex", icon: Mail },
  { key: "ad", label: "Active Directory", short: "AD", icon: Server },
  { key: "bitrix", label: "Bitrix24", short: "Bitrix", icon: Shield },
  { key: "cloud", label: "Доступ к cloud", short: "Cloud", icon: HardDrive },
  { key: "cloudFolder", label: "Личная папка", short: "Папка", icon: FolderOpen },
];

const SYNCABLE_SERVICES: ServiceKey[] = ["yandex", "ad", "bitrix", "cloudFolder"];

function generatePassword(length = 14): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function ServiceCell({
  active,
  configured,
}: {
  active: boolean;
  configured: boolean;
}) {
  if (!configured) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  return active ? (
    <CheckCircle2 size={18} className="mx-auto text-emerald-400" aria-label="Есть" />
  ) : (
    <XCircle size={18} className="mx-auto text-red-400" aria-label="Нет" />
  );
}

function StoredCredentialsBlock({
  login,
  pin,
}: {
  login: string;
  pin: string;
}) {
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<StoredEmployeeCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (pin) headers["x-app-pin"] = pin;
        const res = await fetch(`/api/registration?credentials=${encodeURIComponent(login)}`, {
          headers,
        });
        const body = (await res.json()) as {
          ok?: boolean;
          credentials?: StoredEmployeeCredentials;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.credentials) {
          setError(body.message ?? "Данные не найдены");
          setCredentials(null);
        } else {
          setCredentials(body.credentials);
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить данные");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [login, pin]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-[var(--muted)]">
        <Loader2 size={16} className="animate-spin" />
        Загрузка данных…
      </div>
    );
  }

  if (error || !credentials) {
    return <p className="py-2 text-sm text-red-400">{error ?? "Данные не найдены"}</p>;
  }

  return <EmployeeCredentialsCard data={credentials} />;
}

function SyncForm({
  employee,
  status,
  pin,
  onDone,
  onCancel,
}: {
  employee: EmployeeRecord;
  status: RegistrationStatus | null;
  pin: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [bitrixDepartmentId, setBitrixDepartmentId] = useState<number | "">("");
  const [createYandex, setCreateYandex] = useState(employee.missing.includes("yandex"));
  const [createAd, setCreateAd] = useState(employee.missing.includes("ad"));
  const [createBitrix, setCreateBitrix] = useState(employee.missing.includes("bitrix"));
  const [createFolder, setCreateFolder] = useState(employee.missing.includes("cloudFolder"));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (pin) h["x-app-pin"] = pin;
    return h;
  }, [pin]);

  const selectedDepartment = status?.departments.find((d) => d.id === departmentId);

  useEffect(() => {
    if (selectedDepartment?.bitrixDepartmentId == null) return;
    setBitrixDepartmentId(selectedDepartment.bitrixDepartmentId);
  }, [selectedDepartment?.id, selectedDepartment?.bitrixDepartmentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "sync-services",
          email: employee.email,
          password,
          firstName: employee.firstName ?? "",
          lastName: employee.lastName ?? "",
          departmentId,
          bitrixDepartmentId: createBitrix && bitrixDepartmentId !== "" ? bitrixDepartmentId : undefined,
          createYandex,
          createAd,
          createBitrix,
          createFolder,
          passwordChangeRequired: true,
        }),
      });
      const data = (await res.json()) as RegistrationResult;
      setResult(data);
      if (data.ok) {
        // карточка с паролем остаётся на экране — закрытие вручную
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4"
    >
      <p className="mb-3 text-sm font-medium">
        Дозапись {employee.email} · логин{" "}
        <code className="text-[var(--accent)]">{employee.login}</code>
      </p>

      {employee.services.cloud && !employee.services.cloudFolder && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          Доступ к cloud есть (учётка cloud\{employee.login}), но личная папка Storage\
          {employee.login} не создана.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-[var(--muted)]">Подразделение (AD)</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="" disabled>
              Выберите подразделение AD
            </option>
            {(status?.departments ?? []).map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        {createBitrix && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-[var(--muted)]">Отдел Bitrix24</label>
            <select
              value={bitrixDepartmentId}
              onChange={(e) =>
                setBitrixDepartmentId(e.target.value ? Number(e.target.value) : "")
              }
              required={createBitrix}
              className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="" disabled>
                Выберите отдел Bitrix24
              </option>
              {(status?.bitrixDepartments ?? []).map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} (#{dept.id})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Пароль для новых сервисов</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SYNCABLE_SERVICES.map((key) => {
          const meta = SERVICE_COLUMNS.find((col) => col.key === key)!;
          const missing = employee.missing.includes(key);
          const configured = key === "cloudFolder" ? status?.services.cloud : status?.services[key];
          if (!configured) return null;

          const state = {
            yandex: [createYandex, setCreateYandex],
            ad: [createAd, setCreateAd],
            bitrix: [createBitrix, setCreateBitrix],
            cloudFolder: [createFolder, setCreateFolder],
          } as const;
          const [checked, setChecked] = state[key as keyof typeof state];

          return (
            <label
              key={key}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                missing
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-[var(--card-border)] opacity-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!missing}
                onChange={(e) => setChecked(e.target.checked)}
              />
              {meta.label}
              {!missing && " ✓"}
            </label>
          );
        })}
      </div>

      {result && (
        <div className="mt-3 space-y-3">
          <p className={`text-sm ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
            {result.message}
          </p>
          {result.data && <EmployeeCredentialsCard data={result.data} />}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {!result?.ok && (
          <button
            type="submit"
            disabled={submitting || !departmentId || (createBitrix && bitrixDepartmentId === "")}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Зарегистрировать в выбранных
          </button>
        )}
        {result?.ok ? (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Готово
          </button>
        ) : (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

export default function EmployeesListPanel({ pin, onGoRegister }: Props) {
  const [data, setData] = useState<EmployeeListResult | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [expandedLogin, setExpandedLogin] = useState<string | null>(null);
  const [credentialsLogin, setCredentialsLogin] = useState<string | null>(null);

  const headers = useMemo(
    () => (pin ? { "x-app-pin": pin } : undefined),
    [pin],
  );

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const list = await fetchJson<EmployeeListResult>(
        "/api/registration?list=employees",
        { headers },
        90_000,
      );
      setData(list);
      setStatus(list.registrationStatus ?? null);
    } catch {
      setData(null);
      setStatus(null);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const employees = data?.employees ?? [];
    const q = query.trim().toLowerCase();

    return employees.filter((employee) => {
      if (incompleteOnly && employee.complete) return false;
      if (!q) return true;
      const haystack = [
        employee.email,
        employee.login,
        employee.displayName,
        employee.firstName,
        employee.lastName,
        employee.departmentName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.employees, incompleteOnly, query]);

  const columnCount = 3 + SERVICE_COLUMNS.length;

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)]">
      <div className="border-b border-[var(--card-border)] p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Список сотрудников</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {initialLoading
                ? "Загрузка…"
                : data
                  ? `${data.total} сотрудников · ${data.incomplete} с неполной регистрацией`
                  : "Не удалось загрузить"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по email, ФИО…"
                className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(e) => setIncompleteOnly(e.target.checked)}
              />
              Только неполные
            </label>
            <button
              type="button"
              onClick={() => void fetchAll()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm transition hover:border-[var(--accent)] disabled:opacity-50"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Обновить
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {data?.dryRun && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Dry-run: дозапись в сервисы только симулируется
          </div>
        )}

        {data?.error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {data.error}
          </div>
        )}

        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-relaxed text-[var(--muted)]">
          Почта — <strong className="text-foreground">@novactiv.ru</strong>, AD UPN —{" "}
          <strong className="text-foreground">@novactiv.com</strong>. Cloud: столбец «Cloud» — учётка
          cloud\логин, «Папка» — личная Storage\логин.
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-[var(--card-border)] bg-[var(--background)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Сотрудник</th>
                <th className="px-3 py-3 text-center font-medium">Логин</th>
                {SERVICE_COLUMNS.map((col) => (
                  <th key={col.key} className="px-3 py-3 text-center font-medium">
                    {col.short}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-10 text-center text-[var(--muted)]">
                    {initialLoading ? "Загрузка списка…" : "Сотрудники не найдены"}
                  </td>
                </tr>
              ) : (
                filtered.map((employee, index) => {
                  const name =
                    employee.displayName?.trim() ||
                    [employee.lastName, employee.firstName].filter(Boolean).join(" ") ||
                    employee.email;
                  const rowKey = `${employee.login || employee.email}-${index}`;
                  const expanded = expandedLogin === employee.login;
                  const showCredentials = credentialsLogin === employee.login;

                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-[var(--card-border)]/60 last:border-0">
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium">{name}</p>
                          <p className="text-xs text-[var(--muted)]">{employee.email}</p>
                          {employee.adUpn && employee.adUpn !== employee.email && (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              AD: <span className="font-mono">{employee.adUpn}</span>
                            </p>
                          )}
                          {employee.departmentName && (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {employee.departmentName}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center align-top font-mono text-xs">
                          {employee.login}
                        </td>
                        {SERVICE_COLUMNS.map((col) => (
                          <td key={`${rowKey}-${col.key}`} className="px-3 py-3 text-center align-top">
                            <ServiceCell
                              active={employee.services[col.key]}
                              configured={
                                col.key === "cloud" || col.key === "cloudFolder"
                                  ? (data?.services.cloud ?? false)
                                  : (data?.services[col.key as "yandex" | "ad" | "bitrix"] ?? false)
                              }
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            {employee.hasCredentials && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCredentialsLogin(showCredentials ? null : employee.login);
                                  setExpandedLogin(null);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
                              >
                                <KeyRound size={14} />
                                {showCredentials ? "Скрыть" : "Данные"}
                              </button>
                            )}
                            {!employee.complete && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedLogin(expanded ? null : employee.login);
                                  setCredentialsLogin(null);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs transition hover:border-[var(--accent)]"
                              >
                                <UserPlus size={14} />
                                {expanded ? "Скрыть" : "Дозаписать"}
                              </button>
                            )}
                            {employee.complete && !employee.hasCredentials && (
                              <span className="text-xs text-emerald-400">Везде есть</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {showCredentials && (
                        <tr className="border-b border-[var(--card-border)]/60">
                          <td colSpan={columnCount} className="px-4 pb-4">
                            <StoredCredentialsBlock login={employee.login} pin={pin} />
                          </td>
                        </tr>
                      )}
                      {expanded && (
                        <tr className="border-b border-[var(--card-border)]/60">
                          <td colSpan={columnCount} className="px-4 pb-4">
                            <SyncForm
                              employee={employee}
                              status={status}
                              pin={pin}
                              onDone={() => {
                                setExpandedLogin(null);
                                void fetchAll();
                              }}
                              onCancel={() => setExpandedLogin(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!initialLoading && filtered.length === 0 && onGoRegister && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onGoRegister}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              <UserPlus size={16} />
              Перейти к регистрации
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
