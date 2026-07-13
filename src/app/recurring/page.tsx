"use client";

import { useAppData } from "@/components/DataProvider";
import MerchantLogo from "@/components/MerchantLogo";
import { detectRecurring, fmtUSD, fmtUSD0 } from "@/lib/analytics";

const CADENCE_LABEL = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", yearly: "Yearly" };
const CADENCE_MONTHLY_FACTOR = { weekly: 4.33, biweekly: 2.17, monthly: 1, yearly: 1 / 12 };

export default function RecurringPage() {
  const { data, loading } = useAppData();
  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const items = detectRecurring(data.transactions);
  const monthlyTotal = items.reduce((s, i) => s + i.averageAmount * CADENCE_MONTHLY_FACTOR[i.cadence], 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = items.filter((i) => i.nextDate >= today).slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="text-sm text-ink-muted mt-1">
            {items.length} recurring charges detected · ≈{fmtUSD0(monthlyTotal)}/month
          </p>
        </div>
      </header>

      {upcoming.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">Coming up</h2>
          <div className="flex flex-wrap gap-3">
            {upcoming.map((i) => (
              <div key={i.merchant} className="flex items-center gap-2.5 bg-surface2 rounded-xl px-3.5 py-2.5">
                <MerchantLogo name={i.merchant} domain={i.merchantDomain} logoUrl={i.logoUrl} size={28} />
                <div>
                  <div className="text-xs font-medium">{i.merchant}</div>
                  <div className="text-[11px] text-ink-muted">
                    {new Date(i.nextDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                    · {fmtUSD(i.averageAmount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 py-3 text-xs text-ink-muted uppercase tracking-wide">
          <span>Merchant</span>
          <span>Cadence</span>
          <span className="text-right">Next date</span>
          <span className="text-right">Amount</span>
        </div>
        {items.map((i) => (
          <div
            key={i.merchant}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center px-4 py-3 hover:bg-surface2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <MerchantLogo name={i.merchant} domain={i.merchantDomain} logoUrl={i.logoUrl} size={34} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{i.merchant}</div>
                <div className="text-xs text-ink-muted">
                  {i.category} · seen {i.occurrences}×
                </div>
              </div>
            </div>
            <span className="text-xs text-ink-secondary bg-surface2 border border-white/10 rounded-full px-2.5 py-1">
              {CADENCE_LABEL[i.cadence]}
            </span>
            <span className="text-sm text-ink-secondary text-right tabular">
              {new Date(i.nextDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="text-sm font-medium text-right tabular">{fmtUSD(i.averageAmount)}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="py-16 text-center text-ink-muted text-sm">
            No recurring charges detected yet — need at least 3 occurrences of a merchant.
          </div>
        )}
      </div>
    </div>
  );
}
