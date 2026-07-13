"use client";

import { useAppData } from "@/components/DataProvider";
import { CashFlowBars } from "@/components/charts";
import { fmtUSD0, monthlyCashFlow } from "@/lib/analytics";

export default function CashFlowPage() {
  const { data, loading } = useAppData();
  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const flow = monthlyCashFlow(data.transactions);
  const totalIncome = flow.reduce((s, f) => s + f.income, 0);
  const totalSpend = flow.reduce((s, f) => s + f.spend, 0);
  const avgSavingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome) * 100 : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cash Flow</h1>
        <p className="text-sm text-ink-muted mt-1">Last {flow.length} months</p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total income" value={fmtUSD0(totalIncome)} accent="text-good" />
        <StatCard label="Total spending" value={fmtUSD0(totalSpend)} accent="text-ink-primary" />
        <StatCard
          label="Avg savings rate"
          value={`${avgSavingsRate.toFixed(0)}%`}
          accent={avgSavingsRate >= 0 ? "text-good" : "text-critical"}
        />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-secondary">Income vs. spending</h2>
          <div className="flex items-center gap-4 text-xs text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-2" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-1" /> Spending
            </span>
          </div>
        </div>
        <CashFlowBars data={flow} />
      </div>

      <div className="card p-2">
        <div className="grid grid-cols-4 gap-x-6 px-4 py-3 text-xs text-ink-muted uppercase tracking-wide">
          <span>Month</span>
          <span className="text-right">Income</span>
          <span className="text-right">Spending</span>
          <span className="text-right">Net</span>
        </div>
        {[...flow].reverse().map((f) => (
          <div key={f.month} className="grid grid-cols-4 gap-x-6 px-4 py-3 hover:bg-surface2 rounded-xl text-sm">
            <span className="font-medium">
              {new Date(f.month + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <span className="text-right tabular text-good">{fmtUSD0(f.income)}</span>
            <span className="text-right tabular">{fmtUSD0(f.spend)}</span>
            <span className={`text-right tabular font-medium ${f.net >= 0 ? "text-good" : "text-critical"}`}>
              {f.net >= 0 ? "+" : ""}
              {fmtUSD0(f.net)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
