"use client";

import { useState } from "react";
import { useAppData } from "@/components/DataProvider";
import { CATEGORY_COLORS, fmtUSD0, monthKey } from "@/lib/analytics";
import { computeMonthlyReview, monthTitle, shiftMonth } from "@/lib/review";
import MerchantLogo from "@/components/MerchantLogo";

const GRADE_COLORS: Record<string, string> = {
  A: "#0ca30c",
  B: "#3987e5",
  C: "#fab219",
  D: "#d03b3b",
};

export default function ReviewPage() {
  const { data, loading } = useAppData();
  const [month, setMonth] = useState(() => monthKey(new Date().toISOString().slice(0, 10)));

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const review = computeMonthlyReview(data, month);
  const spendDelta = review.totalSpend - review.avgSpend;
  const spendDeltaPct = review.avgSpend > 0 ? Math.round((spendDelta / review.avgSpend) * 100) : 0;
  const increases = review.categories.filter((c) => c.delta > 1).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const decreases = review.categories.filter((c) => c.delta < -1).sort((a, b) => a.delta - b.delta).slice(0, 3);
  const currentKey = monthKey(new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Review</h1>
          <p className="text-sm text-ink-muted mt-1">Your month, explained</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="text-ink-secondary hover:text-ink-primary px-2 py-1">
            ←
          </button>
          <span className="font-medium w-36 text-center">{monthTitle(month)}</span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentKey}
            className="text-ink-secondary hover:text-ink-primary px-2 py-1 disabled:opacity-30"
          >
            →
          </button>
        </div>
      </header>

      {/* headline */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-5 flex items-center justify-center">
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-4xl font-bold mx-auto"
              style={{ borderColor: GRADE_COLORS[review.grade], color: GRADE_COLORS[review.grade] }}
            >
              {review.grade}
            </div>
            <div className="text-xs text-ink-muted mt-2">Month grade</div>
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-ink-muted">Spent</div>
          <div className="text-2xl font-semibold tabular mt-1">{fmtUSD0(review.totalSpend)}</div>
          <div className={`text-xs mt-1 ${spendDelta <= 0 ? "text-good" : "text-critical"}`}>
            {spendDelta <= 0 ? "▼" : "▲"} {fmtUSD0(Math.abs(spendDelta))} ({Math.abs(spendDeltaPct)}%) vs. your average
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-ink-muted">Income</div>
          <div className="text-2xl font-semibold tabular mt-1 text-good">{fmtUSD0(review.totalIncome)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-ink-muted">Savings rate</div>
          <div
            className={`text-2xl font-semibold tabular mt-1 ${review.savingsRate >= 0 ? "text-good" : "text-critical"}`}
          >
            {(review.savingsRate * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-ink-muted mt-1">of income kept</div>
        </div>
      </div>

      {/* category movement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">What grew</h2>
          {increases.length === 0 && <p className="text-sm text-ink-muted">Nothing grew vs. your average. 🎉</p>}
          <div className="space-y-3">
            {increases.map((c) => (
              <CategoryDelta key={c.category} c={c} />
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">What shrank</h2>
          {decreases.length === 0 && <p className="text-sm text-ink-muted">No categories came in under average.</p>}
          <div className="space-y-3">
            {decreases.map((c) => (
              <CategoryDelta key={c.category} c={c} />
            ))}
          </div>
        </div>
      </div>

      {/* merchants + purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-2">
          <div className="px-4 pt-3 pb-1 text-xs text-ink-muted uppercase tracking-wide">Top merchants</div>
          {review.topMerchants.map((m) => (
            <div key={m.merchant} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface2 rounded-xl">
              <div className="text-sm truncate">
                {m.merchant}
                <span className="text-xs text-ink-muted ml-2">{m.count}×</span>
              </div>
              <span className="text-sm tabular font-medium">{fmtUSD0(m.total)}</span>
            </div>
          ))}
        </div>
        <div className="card p-2">
          <div className="px-4 pt-3 pb-1 text-xs text-ink-muted uppercase tracking-wide">Biggest purchases</div>
          {review.topPurchases.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface2 rounded-xl">
              <MerchantLogo name={t.merchant} domain={t.merchantDomain} logoUrl={t.logoUrl} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{t.merchant}</div>
                <div className="text-xs text-ink-muted">
                  {new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t.category}
                </div>
              </div>
              <span className="text-sm tabular font-medium">{fmtUSD0(Math.abs(t.amount))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* budget results */}
      {review.budgets.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-ink-secondary mb-3">
            Budgets — {review.budgets.length - review.budgetsOver} kept, {review.budgetsOver} over
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {review.budgets.map((b) => (
              <div key={b.category} className="bg-surface2 rounded-xl px-3.5 py-3">
                <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                  {b.category}
                </div>
                <div className={`text-sm tabular mt-1 ${b.over ? "text-critical" : "text-good"}`}>
                  {fmtUSD0(b.spent)} / {fmtUSD0(b.limit)} {b.over ? "✗" : "✓"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryDelta({ c }: { c: { category: string; total: number; avg: number; delta: number } }) {
  const up = c.delta > 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: CATEGORY_COLORS[c.category as keyof typeof CATEGORY_COLORS] }}
      />
      <span className="text-sm flex-1">{c.category}</span>
      <div className="text-right">
        <div className="text-sm tabular">{fmtUSD0(c.total)}</div>
        <div className={`text-xs tabular ${up ? "text-critical" : "text-good"}`}>
          {up ? "▲" : "▼"} {fmtUSD0(Math.abs(c.delta))} vs {fmtUSD0(c.avg)} avg
        </div>
      </div>
    </div>
  );
}
