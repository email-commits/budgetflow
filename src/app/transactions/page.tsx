"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppData } from "@/components/DataProvider";
import TxRow from "@/components/TxRow";
import TxEditModal from "@/components/TxEditModal";
import { fmtUSD0 } from "@/lib/analytics";
import { Category, Transaction } from "@/lib/types";

const CATEGORIES: (Category | "All")[] = [
  "All",
  "Income",
  "Groceries",
  "Shopping",
  "Dining",
  "Transport",
  "Subscriptions",
  "Housing",
  "Utilities",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
];

/** Money-in / money-out filter, settable via ?flow=in|out (dashboard links use this). */
type Flow = "all" | "in" | "out";

const monthTitle = (m: string) =>
  new Date(m + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

export default function TransactionsPage() {
  // useSearchParams needs a Suspense boundary in the app router
  return (
    <Suspense fallback={<div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>}>
      <TransactionsInner />
    </Suspense>
  );
}

function TransactionsInner() {
  const params = useSearchParams();
  const { data, loading, refresh } = useAppData();
  const [query, setQuery] = useState("");
  const initialCat = params.get("cat");
  const [cat, setCat] = useState<Category | "All">(
    initialCat && (CATEGORIES as string[]).includes(initialCat) ? (initialCat as Category) : "All"
  );
  const [flow, setFlow] = useState<Flow>(
    params.get("flow") === "in" ? "in" : params.get("flow") === "out" ? "out" : "all"
  );
  const [month, setMonth] = useState<string | null>(
    /^\d{4}-\d{2}$/.test(params.get("month") ?? "") ? params.get("month") : null
  );
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter((t) => {
      if (!showHidden && t.hidden) return false;
      if (cat !== "All" && t.category !== cat) return false;
      if (month && !t.date.startsWith(month)) return false;
      if (flow === "in" && t.amount <= 0) return false;
      if (flow === "out" && t.amount >= 0) return false;
      if (query && !t.merchant.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [data, query, cat, month, flow, showHidden]);

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered.slice(0, 400)) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const totalOut = filtered.filter((t) => t.amount < 0 && !t.hidden).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIn = filtered.filter((t) => t.amount > 0 && !t.hidden).reduce((s, t) => s + t.amount, 0);
  const hiddenCount = data.transactions.filter((t) => t.hidden).length;
  const scopeLabel = [month && monthTitle(month), flow === "in" ? "money in" : flow === "out" ? "money out" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions{scopeLabel && <span className="text-ink-muted font-normal"> — {scopeLabel}</span>}
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            {filtered.length.toLocaleString()} transactions
            {flow !== "in" && ` · ${fmtUSD0(totalOut)} out`}
            {flow !== "out" && totalIn > 0 && ` · ${fmtUSD0(totalIn)} in`}
            {data.editable && " · click any transaction to edit"}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants…"
          className="bg-surface border border-white/10 rounded-xl px-4 py-2 text-sm w-64 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                cat === c
                  ? "bg-series-1 border-series-1 text-white font-medium"
                  : "border-white/10 text-ink-secondary hover:border-white/25"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["all", "in", "out"] as Flow[]).map((f) => (
            <button
              key={f}
              onClick={() => setFlow(f)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                flow === f
                  ? "bg-series-1 border-series-1 text-white font-medium"
                  : "border-white/10 text-ink-secondary hover:border-white/25"
              }`}
            >
              {f === "all" ? "All flows" : f === "in" ? "Money in" : "Money out"}
            </button>
          ))}
        </div>
        {month && (
          <button
            onClick={() => setMonth(null)}
            className="px-3 py-1.5 rounded-full text-xs border border-series-1/60 text-series-1 hover:border-series-1 transition-colors"
            title="Clear month filter"
          >
            {monthTitle(month)} ✕
          </button>
        )}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden((s) => !s)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              showHidden
                ? "border-white/40 text-ink-primary"
                : "border-white/10 text-ink-muted hover:border-white/25"
            }`}
          >
            {showHidden ? "Hiding hidden ✕" : `Show hidden (${hiddenCount})`}
          </button>
        )}
      </div>

      <div className="card p-2">
        {grouped.map(([date, txs]) => (
          <div key={date}>
            <div className="px-4 pt-4 pb-1 text-xs font-medium text-ink-muted uppercase tracking-wide">
              {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} onClick={data.editable ? () => setEditing(t) : undefined} />
            ))}
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="py-16 text-center text-ink-muted text-sm">No transactions match.</div>
        )}
      </div>

      {editing && <TxEditModal tx={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
