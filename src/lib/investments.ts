import type { Holding as PlaidHolding, Security as PlaidSecurity } from "plaid";
import { Account, Holding } from "./types";

/** Official Plaid security `type` values from `/investments/holdings/get`. */
export type PlaidSecurityType =
  | "cash"
  | "cryptocurrency"
  | "derivative"
  | "equity"
  | "etf"
  | "fixed income"
  | "loan"
  | "mutual fund"
  | "other";

export type AllocationClass = "Equity" | "Fixed income" | "Cash / other";

/**
 * Collapse Plaid security types into the three buckets shown on the dashboard.
 * Cash-equivalents (money-market funds flagged `is_cash_equivalent`) are treated as cash.
 * Equity-like: equity, etf, mutual fund. Bond/CD: fixed income. Everything else: cash/other.
 */
export function allocationClass(type?: string | null): AllocationClass {
  const t = (type ?? "").toLowerCase();
  if (t === "fixed income") return "Fixed income";
  if (t === "equity" || t === "etf" || t === "mutual fund") return "Equity";
  return "Cash / other";
}

export interface AllocationSlice {
  label: AllocationClass;
  value: number;
}

export function allocationSlices(holdings: Holding[]): AllocationSlice[] {
  const totals: Record<AllocationClass, number> = {
    Equity: 0,
    "Fixed income": 0,
    "Cash / other": 0,
  };
  for (const h of holdings) {
    totals[allocationClass(h.type)] += h.value;
  }
  return (Object.entries(totals) as [AllocationClass, number][])
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Display label for a Plaid account type/subtype (401k, IRA, brokerage, depository, …). */
export function accountTypeLabel(account: Pick<Account, "type" | "subtype">): string {
  const raw = (account.subtype || account.type || "").toLowerCase();
  const labels: Record<string, string> = {
    "401a": "401(a)",
    "401k": "401(k)",
    "403b": "403(b)",
    "457b": "457(b)",
    "529": "529",
    brokerage: "Brokerage",
    checking: "Checking",
    savings: "Savings",
    "credit card": "Credit card",
    credit: "Credit card",
    "money market": "Money market",
    "cash management": "Cash management",
    hsa: "HSA",
    ira: "IRA",
    roth: "Roth IRA",
    "roth 401k": "Roth 401(k)",
    "roth 403b": "Roth 403(b)",
    "sep ira": "SEP IRA",
    "simple ira": "SIMPLE IRA",
    "mutual fund": "Mutual fund",
    pension: "Pension",
    retirement: "Retirement",
    "profit sharing plan": "Profit sharing",
    "stock plan": "Stock plan",
    "crypto exchange": "Crypto",
    investment: "Investment",
    loan: "Loan",
    depository: "Depository",
  };
  if (labels[raw]) return labels[raw];
  if (!raw) return "Account";
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isInvestmentAccount(account: Pick<Account, "type">): boolean {
  return account.type === "investment";
}

export function investedTotal(accounts: Account[]): number {
  return accounts.filter(isInvestmentAccount).reduce((s, a) => s + a.balance, 0);
}

export function cashTotal(accounts: Account[]): number {
  return accounts
    .filter((a) => a.type === "checking" || a.type === "savings")
    .reduce((s, a) => s + a.balance, 0);
}

export function mapPlaidHoldings(
  holdings: PlaidHolding[],
  securities: PlaidSecurity[],
  accounts: { id: string; name: string }[]
): Holding[] {
  const secs = new Map(securities.map((s) => [s.security_id, s]));
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const out: Holding[] = [];
  for (const h of holdings) {
    const sec = secs.get(h.security_id);
    const type = sec?.is_cash_equivalent ? "cash" : (sec?.type ?? undefined);
    out.push({
      id: `${h.account_id}:${h.security_id}`,
      accountId: h.account_id,
      accountName: names.get(h.account_id),
      name: sec?.name ?? sec?.ticker_symbol ?? "Unknown security",
      ticker: sec?.ticker_symbol ?? undefined,
      type,
      quantity: h.quantity,
      value: h.institution_value ?? 0,
      costBasis: h.cost_basis ?? undefined,
    });
  }
  return out;
}
