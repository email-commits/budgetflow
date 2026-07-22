"use client";

import { useMemo, useState } from "react";
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

export default function TransactionsPage() {
  const { data, loading, refresh } = useAppData();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter((t) => {
      if (!showHidden && t.hidden) return false;
      if (cat !== "All" && t.category !== cat) return false;
      if (query && !t.merchant.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [data, query, cat, showHidden]);

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
  const hiddenCount = data.transactions.filter((t) => t.hidden).length;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-ink-muted mt-1">
            {filtered.length.toLocaleString()} transactions · {fmtUSD0(totalOut)} out
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
