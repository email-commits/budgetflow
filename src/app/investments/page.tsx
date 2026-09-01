"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useAppData } from "@/components/DataProvider";
import { AllocationDonut, ALLOCATION_COLORS } from "@/components/charts";
import { BrokerageConnectButtons, PlaidScript, usePlaidConnect } from "@/components/PlaidConnect";
import { fmtUSD, fmtUSD0 } from "@/lib/analytics";
import { breakdownByInstitution } from "@/lib/institutions";
import { accountTypeLabel, allocationSlices, investedTotal, isInvestmentAccount } from "@/lib/investments";
import { totalNetWorth } from "@/lib/types";

export default function InvestmentsPage() {
  const { data, loading, refresh } = useAppData();
  const afterLink = useCallback(async () => {
    await refresh();
  }, [refresh]);
  const { busy, busyTarget, error, connect } = usePlaidConnect(afterLink);

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const live = data.mode === "plaid";
  const holdings = live ? [...(data.holdings ?? [])].sort((a, b) => b.value - a.value) : [];
  const investAccounts = live ? data.accounts.filter(isInvestmentAccount) : [];
  const accountsTotal = investedTotal(live ? data.accounts : []);
  const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0);
  const netWorth = live ? totalNetWorth(data) : 0;
  const instBreakdown = breakdownByInstitution(live ? data.accounts : []);
  const slices = allocationSlices(holdings);

  const empty = !live || (investAccounts.length === 0 && holdings.length === 0);

  return (
    <div className="space-y-6">
      <PlaidScript />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-ink-muted mt-1">
          {empty
            ? "Connect a brokerage to see live holdings"
            : `${investAccounts.length} investment account${investAccounts.length === 1 ? "" : "s"} · ${fmtUSD0(accountsTotal)}`}
        </p>
      </header>

      {empty ? (
        <div className="card p-10 text-center space-y-5">
          <div className="space-y-2">
            <p className="text-ink-primary font-medium">No investment accounts linked yet</p>
            <p className="text-ink-secondary text-sm max-w-lg mx-auto leading-relaxed">
              {data.mode === "demo"
                ? "Demo mode never shows sample holdings as live data. Connect Fidelity, T. Rowe Price, or Charles Schwab through Plaid to pull real balances and securities."
                : "Link a brokerage or retirement account to see holdings, allocation, and institution breakdown. Bank accounts stay on the dashboard."}
            </p>
          </div>
          <div className="max-w-xl mx-auto text-left">
            <BrokerageConnectButtons connect={connect} busy={busy} busyTarget={busyTarget} />
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
          <p className="text-xs text-ink-muted">
            Or connect any institution from{" "}
            <Link href="/settings" className="text-series-1 hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Invested" value={fmtUSD0(accountsTotal)} accent="text-ink-primary" />
            <Stat label="Net worth" value={fmtUSD0(netWorth)} accent="text-ink-primary" />
            <Stat label="Holdings value" value={fmtUSD0(holdingsTotal)} accent="text-ink-primary" />
            <Stat
              label="Accounts"
              value={String(investAccounts.length)}
              accent="text-ink-primary"
            />
          </div>

          {instBreakdown.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink-secondary mb-3">By institution</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {instBreakdown.map((row) => (
                  <div key={row.group} className="bg-surface2 rounded-xl px-4 py-3">
                    <div className="text-xs text-ink-muted">{row.group}</div>
                    <div className="text-lg font-semibold tabular mt-0.5">{fmtUSD0(row.total)}</div>
                    <div className="text-xs text-ink-muted">
                      {row.accounts} account{row.accounts === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-3 text-xs text-ink-muted uppercase tracking-wide">
              <span>Account</span>
              <span className="text-right">Type</span>
              <span className="text-right">Balance</span>
            </div>
            {data.accounts.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-4 py-3 hover:bg-surface2 rounded-xl"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs text-ink-muted">
                    {a.institution} ••{a.mask}
                  </div>
                </div>
                <span className="text-xs text-ink-secondary">{accountTypeLabel(a)}</span>
                <span className={`text-sm tabular text-right ${a.balance < 0 ? "text-serious" : ""}`}>
                  {fmtUSD(a.balance)}
                </span>
              </div>
            ))}
          </div>

          {holdings.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-ink-secondary text-sm max-w-md mx-auto leading-relaxed">
                Account balances are in, but Plaid hasn&apos;t returned holdings yet. Reconnect the brokerage with
                the Investments product (Settings) or wait for the next sync — never backfilled with sample data.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-5">
                <h2 className="text-sm font-medium text-ink-secondary mb-1">Asset allocation</h2>
                <p className="text-xs text-ink-muted mb-1">From Plaid security types</p>
                <AllocationDonut slices={slices} centerLabel="Portfolio" centerValue={fmtUSD0(holdingsTotal)} />
                <div className="mt-2 space-y-1.5">
                  {slices.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                      />
                      <span className="text-ink-secondary flex-1">{s.label}</span>
                      <span className="tabular text-ink-muted">
                        {holdingsTotal > 0 ? `${((s.value / holdingsTotal) * 100).toFixed(0)}%` : "—"}
                      </span>
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
                  <span className="text-right">Alloc.</span>
                </div>
                {holdings.map((h) => {
                  const pct = holdingsTotal > 0 ? (h.value / holdingsTotal) * 100 : 0;
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
                      <span className="text-sm text-ink-secondary text-right tabular">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
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
