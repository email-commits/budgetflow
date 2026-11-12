"use client";

import { CATEGORY_COLORS, fmtUSD } from "@/lib/analytics";
import { Account, paymentKind, Transaction } from "@/lib/types";
import MerchantLogo from "./MerchantLogo";

export default function TxRow({
  tx,
  account,
  onClick,
}: {
  tx: Transaction;
  /** the account this transaction posted to — shows "Credit card" / "Debit" on the row */
  account?: Account;
  onClick?: () => void;
}) {
  const positive = tx.amount > 0;
  const kind = account ? paymentKind(account) : null;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-surface2 rounded-xl transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${tx.hidden ? "opacity-40" : ""}`}
    >
      <MerchantLogo name={tx.merchant} domain={tx.merchantDomain} logoUrl={tx.logoUrl} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {tx.merchant}
          {tx.edited && <span className="w-1.5 h-1.5 rounded-full bg-series-1 shrink-0" title="Edited" />}
          {tx.pending && (
            <span className="text-[10px] uppercase tracking-wide text-warning border border-warning/40 rounded-full px-1.5 py-px">
              Pending
            </span>
          )}
          {tx.hidden && (
            <span className="text-[10px] uppercase tracking-wide text-ink-muted border border-white/20 rounded-full px-1.5 py-px">
              Hidden
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: CATEGORY_COLORS[tx.category] }}
          />
          {tx.category}
          {kind && account && (
            <span
              className={`ml-1 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-px border ${
                kind === "Credit card" ? "text-series-1 border-series-1/40" : "text-ink-secondary border-white/20"
              }`}
              title={`${account.name} · ${account.institution} ••${account.mask}`}
            >
              {kind} ••{account.mask}
            </span>
          )}
        </div>
      </div>
      <div className={`text-sm font-medium tabular ${positive ? "text-good" : "text-ink-primary"}`}>
        {positive ? "+" : ""}
        {fmtUSD(tx.amount)}
      </div>
    </div>
  );
}
