"use client";

import { useAppData } from "@/components/DataProvider";
import { CATEGORY_COLORS, fmtUSD0, monthKey, spendByCategory } from "@/lib/analytics";

export default function BudgetsPage() {
  const { data, loading } = useAppData();
  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const thisMonth = monthKey(new Date().toISOString().slice(0, 10));
  const spend = new Map(spendByCategory(data.transactions, thisMonth).map((s) => [s.category, s.total]));

  const totalBudget = data.budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = data.budgets.reduce((s, b) => s + (spend.get(b.category) ?? 0), 0);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthPct = (new Date().getDate() / daysInMonth) * 100;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <p className="text-sm text-ink-muted mt-1">
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} · {fmtUSD0(totalSpent)} of{" "}
          {fmtUSD0(totalBudget)} budgeted
        </p>
      </header>

      <div className="card p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-ink-secondary">Overall</span>
          <span className="tabular">
            {fmtUSD0(totalSpent)} <span className="text-ink-muted">/ {fmtUSD0(totalBudget)}</span>
          </span>
        </div>
        <ProgressBar pct={(totalSpent / totalBudget) * 100} color="#3987e5" markerPct={monthPct} />
        <div className="text-xs text-ink-muted mt-2">
          The tick marks where you&apos;d be if spending were even across the month ({Math.round(monthPct)}% through).
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.budgets.map((b) => {
          const spent = spend.get(b.category) ?? 0;
          const pct = (spent / b.monthlyLimit) * 100;
          const over = pct > 100;
          const near = pct > 85 && !over;
          const color = over ? "#d03b3b" : near ? "#fab219" : CATEGORY_COLORS[b.category];
          return (
            <div key={b.category} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                  <span className="text-sm font-medium">{b.category}</span>
                </div>
                <span className="text-sm tabular">
                  {fmtUSD0(spent)} <span className="text-ink-muted">/ {fmtUSD0(b.monthlyLimit)}</span>
                </span>
              </div>
              <ProgressBar pct={pct} color={color} markerPct={monthPct} />
              <div className={`text-xs mt-2 ${over ? "text-critical" : near ? "text-warning" : "text-ink-muted"}`}>
                {over
                  ? `⚠ ${fmtUSD0(spent - b.monthlyLimit)} over budget`
                  : `${fmtUSD0(b.monthlyLimit - spent)} left`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ pct, color, markerPct }: { pct: number; color: string; markerPct?: number }) {
  return (
    <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
      {markerPct !== undefined && (
        <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${Math.min(markerPct, 100)}%` }} />
      )}
    </div>
  );
}
