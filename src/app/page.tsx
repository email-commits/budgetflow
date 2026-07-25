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
  monthLabel,
  monthlyCashFlow,
  netWorthSeries,
  spendByCategory,
} from "@/lib/analytics";
import { totalNetWorth } from "@/lib/types";
import { detectAnomalies } from "@/lib/anomalies";
import { InitialAvatar } from "@/components/MerchantLogo";
import Link from "next/link";

const fmtDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const KIND_LABELS: Record<string, string> = {
  property: "Property",
  vehicle: "Vehicle",
  cash: "Cash",
  other: "Other asset",
  liability: "Liability",
};

export default function Dashboard() {
  const { data, loading } = useAppData();
  if (loading || !data) return <Loading />;

  const netWorth = totalNetWorth(data);
  // Real recorded snapshots when we have enough of them; estimated series otherwise
  const history = data.netWorthHistory ?? [];
  const useReal = history.length >= 2;
  const nwPoints = useReal
    ? history.map((p) => ({ x: fmtDay(p.date), value: p.total }))
    : netWorthSeries(data.transactions, netWorth).map((p) => ({ x: monthLabel(p.month), value: p.value }));
  const manualAssets = data.manualAssets ?? [];
  const anomalies = detectAnomalies(data.transactions);
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

      {/* Alerts */}
      {anomalies.length > 0 && (
        <div className="card p-4 border-warning/30">
          <div className="text-xs text-warning uppercase tracking-wide mb-2">
            ⚠ {anomalies.length} thing{anomalies.length === 1 ? "" : "s"} worth a look
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {anomalies.slice(0, 4).map((a, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{a.title}</span>
                <span className="text-ink-muted"> — {a.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net worth + accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">
            Net worth over time{" "}
            {!useReal && <span className="text-xs text-ink-muted font-normal">(estimated — real tracking builds daily)</span>}
          </h2>
          <NetWorthLine points={nwPoints} />
        </div>
        <div className="card p-5 max-h-[300px] overflow-y-auto">
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
            {manualAssets.map((m) => {
              const negative = m.kind === "liability";
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <InitialAvatar name={m.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className="text-xs text-ink-muted">{KIND_LABELS[m.kind]}</div>
                  </div>
                  <div className={`text-sm tabular ${negative ? "text-serious" : "text-ink-primary"}`}>
                    {fmtUSD(negative ? -Math.abs(m.value) : m.value)}
                  </div>
                </div>
              );
            })}
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
              <Stat
                label="Income"
                value={fmtUSD0(cur.income)}
                color="text-good"
                href={`/transactions?month=${thisMonth}&flow=in`}
              />
              <Stat
                label="Spending"
                value={fmtUSD0(cur.spend)}
                color="text-ink-primary"
                href={`/transactions?month=${thisMonth}&flow=out`}
              />
              <Stat
                label="Net"
                value={`${cur.net >= 0 ? "+" : ""}${fmtUSD0(cur.net)}`}
                color={cur.net >= 0 ? "text-good" : "text-critical"}
                href="/cashflow"
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

function Stat({ label, value, color, href }: { label: string; value: string; color: string; href?: string }) {
  const inner = (
    <>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular ${color}`}>{value}</div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block -mx-2 px-2 py-1 rounded-lg hover:bg-surface2 transition-colors cursor-pointer"
        title={`View ${label.toLowerCase()} details`}
      >
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-[60vh] text-ink-muted text-sm animate-pulse">
      Loading your finances…
    </div>
  );
}
