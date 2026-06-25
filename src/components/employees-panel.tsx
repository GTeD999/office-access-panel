"use client";

import EmployeesListPanel from "@/components/employees-list-panel";
import RegistrationPanel from "@/components/registration-panel";
import { List, UserPlus, Users } from "lucide-react";
import { useState } from "react";

type Props = {
  pin: string;
};

type EmployeesSubTab = "list" | "register";

export default function EmployeesPanel({ pin }: Props) {
  const [subTab, setSubTab] = useState<EmployeesSubTab>("list");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)]">
        <div className="border-b border-[var(--card-border)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Users size={22} className="text-[var(--accent)]" />
                Сотрудники
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Список учёток по сервисам и регистрация новых сотрудников
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-1">
              <button
                type="button"
                onClick={() => setSubTab("list")}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  subTab === "list"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                <List size={16} />
                Список сотрудников
              </button>
              <button
                type="button"
                onClick={() => setSubTab("register")}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  subTab === "register"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                <UserPlus size={16} />
                Регистрация
              </button>
            </div>
          </div>
        </div>
      </section>

      {subTab === "register" ? (
        <RegistrationPanel pin={pin} embedded />
      ) : (
        <EmployeesListPanel pin={pin} onGoRegister={() => setSubTab("register")} />
      )}
    </div>
  );
}
