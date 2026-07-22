"use client";

import { useState } from "react";
import { useAppData } from "@/components/DataProvider";
import { CATEGORY_COLORS, fmtUSD0, monthKey, spendByCategory } from "@/lib/analytics";
import { Budget, Category } from "@/lib/types";

const ALL_CATEGORIES: Category[] = [
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

function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetsPage() {
  const { data, loading, refresh } = useAppData();
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [rolloverInput, setRolloverInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState<Category | "">("");

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const thisMonth = monthKey(new Date().toISOString().slice(0, 10));
  const lastMonth = prevMonthKey(thisMonth);
  const spend = new Map(spendByCategory(data.transactions, thisMonth).map((s) => [s.category, s.total]));
  const prevSpend = new Map(spendByCategory(data.transactions, lastMonth).map((s) => [s.category, s.total]));

  const carryFor = (b: Budget) =>
    b.rollover ? Math.max(0, b.monthlyLimit - (prevSpend.get(b.category) ?? 0)) : 0;

  const totalBudget = data.budgets.reduce((s, b) => s + b.monthlyLimit + carryFor(b), 0);
  const totalSpent = data.budgets.reduce((s, b) => s + (spend.get(b.category) ?? 0), 0);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthPct = (new Date().getDate() / daysInMonth) * 100;

  const startEdit = (b: Budget) => {
    setEditingCat(b.category);
    setLimitInput(String(b.monthlyLimit));
    setRolloverInput(Boolean(b.rollover));
  };

  const saveEdit = async (category: string) => {
    setBusy(true);
    try {
      await fetch("/api/budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, monthlyLimit: Number(limitInput) || 0, rollover: rolloverInput }),
      });
      await refresh();
      setEditingCat(null);
    } finally {
      setBusy(false);
    }
  };

  const removeBudget = async (category: string) => {
    setBusy(true);
    try {
      await fetch(`/api/budgets?category=${encodeURIComponent(category)}`, { method: "DELETE" });
      await refresh();
      setEditingCat(null);
    } finally {
      setBusy(false);
    }
  };

  const addBudget = async () => {
    if (!newCat) return;
    setBusy(true);
    try {
      await fetch("/api/budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCat, monthlyLimit: 200 }),
      });
      await refresh();
      setAdding(false);
      setNewCat("");
    } finally {
      setBusy(false);
    }
  };

  const unbudgeted = ALL_CATEGORIES.filter((c) => !data.budgets.some((b) => b.category === c));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <p className="text-sm text-ink-muted mt-1">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} · {fmtUSD0(totalSpent)} of{" "}
            {fmtUSD0(totalBudget)} budgeted
          </p>
        </div>
        {data.editable && unbudgeted.length > 0 && (
          <div className="flex items-center gap-2">
            {adding ? (
              <>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value as Category)}
                  className="bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
                >
                  <option value="">Pick category…</option>
                  {unbudgeted.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addBudget}
                  disabled={!newCat || busy}
                  className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
                >
                  Add
                </button>
              </>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="text-sm text-series-1 hover:underline"
              >
                + Add budget
              </button>
            )}
          </div>
        )}
      </header>

      <div className="card p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-ink-secondary">Overall</span>
          <span className="tabular">
            {fmtUSD0(totalSpent)} <span className="text-ink-muted">/ {fmtUSD0(totalBudget)}</span>
          </span>
        </div>
        <ProgressBar pct={totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0} color="#3987e5" markerPct={monthPct} />
        <div className="text-xs text-ink-muted mt-2">
          The tick marks where you&apos;d be if spending were even across the month ({Math.round(monthPct)}% through).
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.budgets.map((b) => {
          const spent = spend.get(b.category) ?? 0;
          const carry = carryFor(b);
          const effectiveLimit = b.monthlyLimit + carry;
          const pct = effectiveLimit > 0 ? (spent / effectiveLimit) * 100 : 100;
          const over = pct > 100;
          const near = pct > 85 && !over;
          const color = over ? "#d03b3b" : near ? "#fab219" : CATEGORY_COLORS[b.category];
          const isEditing = editingCat === b.category;

          return (
            <div key={b.category} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                  <span className="text-sm font-medium">{b.category}</span>
                  {b.rollover && (
                    <span className="text-[10px] uppercase tracking-wide text-ink-muted border border-white/20 rounded-full px-1.5 py-px">
                      Rollover
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">$</span>
                    <input
                      value={limitInput}
                      onChange={(e) => setLimitInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-20 bg-surface2 border border-white/10 rounded-lg px-2 py-1 text-sm tabular outline-none focus:border-series-1"
                      autoFocus
                    />
                  </div>
                ) : (
                  <span className="text-sm tabular">
                    {fmtUSD0(spent)}{" "}
                    <span className="text-ink-muted">
                      / {fmtUSD0(effectiveLimit)}
                      {carry > 0 && <span className="text-good"> (+{fmtUSD0(carry)})</span>}
                    </span>
                  </span>
                )}
              </div>

              <ProgressBar pct={pct} color={color} markerPct={monthPct} />

              {isEditing ? (
                <div className="flex items-center justify-between mt-3">
                  <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rolloverInput}
                      onChange={(e) => setRolloverInput(e.target.checked)}
                      className="accent-[#3987e5]"
                    />
                    Roll over unspent
                  </label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => removeBudget(b.category)} disabled={busy} className="text-xs text-ink-muted hover:text-critical">
                      Remove
                    </button>
                    <button onClick={() => setEditingCat(null)} className="text-xs text-ink-secondary">
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(b.category)}
                      disabled={busy}
                      className="text-xs bg-series-1 text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <div className={`text-xs ${over ? "text-critical" : near ? "text-warning" : "text-ink-muted"}`}>
                    {over
                      ? `⚠ ${fmtUSD0(spent - effectiveLimit)} over budget`
                      : `${fmtUSD0(effectiveLimit - spent)} left`}
                  </div>
                  {data.editable && (
                    <button onClick={() => startEdit(b)} className="text-xs text-ink-muted hover:text-ink-primary">
                      Edit
                    </button>
                  )}
                </div>
              )}
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
