"use client";

import { CATEGORY_COLORS, fmtUSD } from "@/lib/analytics";
import { Transaction } from "@/lib/types";
import MerchantLogo from "./MerchantLogo";

export default function TxRow({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 rounded-xl transition-colors">
      <MerchantLogo name={tx.merchant} domain={tx.merchantDomain} logoUrl={tx.logoUrl} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {tx.merchant}
          {tx.pending && (
            <span className="text-[10px] uppercase tracking-wide text-warning border border-warning/40 rounded-full px-1.5 py-px">
              Pending
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: CATEGORY_COLORS[tx.category] }}
          />
          {tx.category}
        </div>
      </div>
      <div className={`text-sm font-medium tabular ${positive ? "text-good" : "text-ink-primary"}`}>
        {positive ? "+" : ""}
        {fmtUSD(tx.amount)}
      </div>
    </div>
  );
}
