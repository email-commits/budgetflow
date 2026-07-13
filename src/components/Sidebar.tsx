"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppData } from "./DataProvider";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/transactions", label: "Transactions", icon: "⇄" },
  { href: "/budgets", label: "Budgets", icon: "◔" },
  { href: "/recurring", label: "Recurring", icon: "↻" },
  { href: "/cashflow", label: "Cash Flow", icon: "∿" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data } = useAppData();

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-hairline bg-page flex flex-col">
      <div className="px-6 py-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-series-1 flex items-center justify-center font-bold text-white">B</div>
        <span className="text-lg font-semibold tracking-tight">BudgetFlow</span>
      </div>

      <nav className="px-3 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? "bg-surface2 text-ink-primary font-medium"
                  : "text-ink-secondary hover:bg-surface hover:text-ink-primary"
              }`}
            >
              <span className="w-5 text-center opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 py-5 text-xs text-ink-muted">
        {data && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.mode === "plaid" ? "bg-good" : "bg-warning"}`}
            />
            {data.mode === "plaid" ? "Plaid connected" : "Demo data"}
          </span>
        )}
      </div>
    </aside>
  );
}
