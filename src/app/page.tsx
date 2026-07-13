"use client";

import { useAppData } from "@/components/DataProvider";
import MerchantLogo from "@/components/MerchantLogo";
import TxRow from "@/components/TxRow";
import { NetWorthLine, SpendingDonut } from "@/components/charts";
import {
  CATEGORY_COLORS,
  fmtUSD,
  fmtUSD0,
  monthKey,
  monthlyCashFlow,
  netWorthSeries,
  spendByCategory,
} from "@/lib/analytics";
import Link from "next/link";

export default function Dashboard() {
  const { data, loading } = useAppData();
  if (loading || !data) return <Loading />;

  const netWorth = data.accounts.reduce((s, a) => s + a.balance, 0);
  const nwSeries = netWorthSeries(data.transactions, netWorth);
  const thisMonth = monthKey(new Date().toISOString().slice(0, 10));
  const catSpend = spendByCategory(data.transactions, thisMonth);
  const totalSpend = catSpend.reduce((s, c) => s + c.total, 0);
  const flow = monthlyCashFlow(data.transactions);
  const cur = flow[flow.length - 1];
  const recent = data.transactions.slice(0, 8);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted">Net worth</div>
          <div className="text-2xl font-semibold tabular">{fmtUSD0(netWorth)}</div>
        </div>
      </header>

      {/* Net worth + accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">Net worth over time</h2>
          <NetWorthLine data={nwSeries} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">Accounts</h2>
          <div className="space-y-3">
            {data.accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <MerchantLogo name={a.institution} domain={a.institutionDomain} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs text-ink-muted">
                    {a.institution} ••{a.mask}
                  </div>
                </div>
                <div className={`text-sm tabular ${a.balance < 0 ? "text-serious" : "text-ink-primary"}`}>
                  {fmtUSD(a.balance)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* This month */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-1">Spending by category</h2>
          <SpendingDonut data={catSpend} total={totalSpend} />
          <div className="mt-2 space-y-1.5">
            {catSpend.slice(0, 5).map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[c.category] }} />
                <span className="text-ink-secondary flex-1">{c.category}</span>
                <span className="tabular">{fmtUSD0(c.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5 flex flex-col justify-between">
          <h2 className="text-sm font-medium text-ink-secondary">This month</h2>
          {cur && (
            <div className="space-y-5 my-4">
              <Stat label="Income" value={fmtUSD0(cur.income)} color="text-good" />
              <Stat label="Spending" value={fmtUSD0(cur.spend)} color="text-ink-primary" />
              <Stat
                label="Net"
                value={`${cur.net >= 0 ? "+" : ""}${fmtUSD0(cur.net)}`}
                color={cur.net >= 0 ? "text-good" : "text-critical"}
              />
            </div>
          )}
          <Link href="/cashflow" className="text-sm text-series-1 hover:underline">
            View cash flow →
          </Link>
        </div>

        <div className="card p-3">
          <div className="flex items-center justify-between px-2 pt-2 pb-1">
            <h2 className="text-sm font-medium text-ink-secondary">Recent transactions</h2>
            <Link href="/transactions" className="text-xs text-series-1 hover:underline">
              See all
            </Link>
          </div>
          <div>
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular ${color}`}>{value}</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-[60vh] text-ink-muted text-sm animate-pulse">
      Loading your finances…
    </div>
  );
}
