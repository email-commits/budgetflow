"use client";

import { useAppData } from "@/components/DataProvider";
import { AllocationDonut, ALLOCATION_COLORS } from "@/components/charts";
import { fmtUSD, fmtUSD0 } from "@/lib/analytics";

const TYPE_LABELS: Record<string, string> = {
  equity: "Stocks",
  etf: "ETFs",
  "mutual fund": "Mutual funds",
  "fixed income": "Fixed income",
  cash: "Cash",
  cryptocurrency: "Crypto",
  derivative: "Derivatives",
  loan: "Loans",
  other: "Other",
};

export default function InvestmentsPage() {
  const { data, loading } = useAppData();
  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const holdings = [...(data.holdings ?? [])].sort((a, b) => b.value - a.value);
  const investAccounts = data.accounts.filter((a) => a.type === "investment");
  const accountsTotal = investAccounts.reduce((s, a) => s + a.balance, 0);
  const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0);

  const withBasis = holdings.filter((h) => h.costBasis !== undefined && h.costBasis > 0);
  const totalBasis = withBasis.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  const totalBasisValue = withBasis.reduce((s, h) => s + h.value, 0);
  const totalGain = totalBasisValue - totalBasis;
  const gainPct = totalBasis > 0 ? (totalGain / totalBasis) * 100 : 0;

  const byType = new Map<string, number>();
  for (const h of holdings) {
    const label = TYPE_LABELS[h.type ?? "other"] ?? (h.type || "Other");
    byType.set(label, (byType.get(label) ?? 0) + h.value);
  }
  const slices = [...byType.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-ink-muted mt-1">
          {investAccounts.length} investment account{investAccounts.length === 1 ? "" : "s"} ·{" "}
          {fmtUSD0(accountsTotal)}
        </p>
      </header>

      {holdings.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <p className="text-ink-secondary text-sm max-w-md mx-auto leading-relaxed">
            No holdings data yet. Your investment account <b>balances</b> are tracked, but per-security
            holdings need Plaid&apos;s investments product — reconnect your brokerage via{" "}
            <b>Settings → Connect a bank with Plaid</b> and holdings will appear here after the next sync.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Holdings value" value={fmtUSD0(holdingsTotal)} accent="text-ink-primary" />
            <Stat
              label="Total gain/loss"
              value={`${totalGain >= 0 ? "+" : ""}${fmtUSD0(totalGain)}`}
              accent={totalGain >= 0 ? "text-good" : "text-critical"}
            />
            <Stat
              label="Return on cost"
              value={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`}
              accent={gainPct >= 0 ? "text-good" : "text-critical"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink-secondary mb-1">Allocation</h2>
              <AllocationDonut slices={slices} centerLabel="Portfolio" centerValue={fmtUSD0(holdingsTotal)} />
              <div className="mt-2 space-y-1.5">
                {slices.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                    />
                    <span className="text-ink-secondary flex-1">{s.label}</span>
                    <span className="tabular">{fmtUSD0(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-2 lg:col-span-2">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 py-3 text-xs text-ink-muted uppercase tracking-wide">
                <span>Security</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Value</span>
                <span className="text-right">Gain</span>
              </div>
              {holdings.map((h) => {
                const gain = h.costBasis !== undefined && h.costBasis > 0 ? h.value - h.costBasis : undefined;
                return (
                  <div
                    key={h.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center px-4 py-3 hover:bg-surface2 rounded-xl"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {h.ticker ? <span className="text-series-1 mr-2">{h.ticker}</span> : null}
                        {h.name}
                      </div>
                      <div className="text-xs text-ink-muted truncate">{h.accountName}</div>
                    </div>
                    <span className="text-sm text-ink-secondary text-right tabular">
                      {h.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </span>
                    <span className="text-sm font-medium text-right tabular">{fmtUSD(h.value)}</span>
                    <span
                      className={`text-sm text-right tabular ${
                        gain === undefined ? "text-ink-muted" : gain >= 0 ? "text-good" : "text-critical"
                      }`}
                    >
                      {gain === undefined ? "—" : `${gain >= 0 ? "+" : ""}${fmtUSD0(gain)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {investAccounts.length > 0 && (
        <div className="card p-2">
          <div className="px-4 pt-3 pb-1 text-xs text-ink-muted uppercase tracking-wide">Accounts</div>
          {investAccounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-surface2 rounded-xl">
              <div>
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-ink-muted">
                  {a.institution} ••{a.mask}
                </div>
              </div>
              <span className="text-sm tabular">{fmtUSD(a.balance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
