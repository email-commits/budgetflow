"use client";

import { useState } from "react";
import { CATEGORY_COLORS, fmtUSD } from "@/lib/analytics";
import { Category, Transaction } from "@/lib/types";
import MerchantLogo from "./MerchantLogo";

const CATEGORIES: Category[] = [
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

export default function TxEditModal({
  tx,
  onClose,
  onSaved,
}: {
  tx: Transaction;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [merchant, setMerchant] = useState(tx.merchant);
  const [category, setCategory] = useState<Category>(tx.category);
  const [hidden, setHidden] = useState(Boolean(tx.hidden));
  const [makeRule, setMakeRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changedMerchant = merchant.trim() !== tx.merchant;
  const changedCategory = category !== tx.category;
  const changedHidden = hidden !== Boolean(tx.hidden);
  const dirty = changedMerchant || changedCategory || changedHidden || makeRule;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (changedMerchant) body.merchant = merchant.trim();
      if (changedCategory) body.category = category;
      if (changedHidden) body.hidden = hidden;
      if (Object.keys(body).length > 0) {
        const resp = await fetch(`/api/transactions/${tx.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error((await resp.json()).error ?? "Save failed");
      }
      if (makeRule) {
        const resp = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            match: tx.merchant,
            setCategory: changedCategory ? category : undefined,
            renameTo: changedMerchant ? merchant.trim() : undefined,
          }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error ?? "Rule creation failed");
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: null, category: null, hidden: false }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Revert failed");
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 space-y-5 bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <MerchantLogo name={tx.merchant} domain={tx.merchantDomain} logoUrl={tx.logoUrl} size={40} />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{tx.merchant}</div>
            <div className="text-xs text-ink-muted">
              {new Date(tx.date + "T12:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
          <div className="text-lg font-semibold tabular">{fmtUSD(tx.amount)}</div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-ink-muted">Merchant name</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="w-full bg-surface2 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-series-1"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-ink-muted">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors flex items-center gap-1.5 ${
                  category === c
                    ? "border-white/60 text-ink-primary font-medium bg-surface2"
                    : "border-white/10 text-ink-secondary hover:border-white/25"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink-secondary cursor-pointer">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-[#3987e5]" />
          Hide from budgets &amp; reports
        </label>

        {(changedMerchant || changedCategory) && (
          <label className="flex items-start gap-2.5 text-sm text-ink-secondary cursor-pointer bg-surface2 rounded-xl p-3">
            <input
              type="checkbox"
              checked={makeRule}
              onChange={(e) => setMakeRule(e.target.checked)}
              className="accent-[#3987e5] mt-0.5"
            />
            <span>
              Always do this — create a rule for anything matching{" "}
              <b className="text-ink-primary">&ldquo;{tx.merchant}&rdquo;</b>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-critical">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          {tx.edited || tx.hidden ? (
            <button onClick={revert} disabled={busy} className="text-sm text-ink-muted hover:text-critical">
              Revert to original
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm border border-white/10 text-ink-secondary hover:border-white/25"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="px-4 py-2 rounded-xl text-sm bg-series-1 text-white font-medium disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
