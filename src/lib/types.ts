export type Category =
  | "Income"
  | "Groceries"
  | "Shopping"
  | "Dining"
  | "Transport"
  | "Subscriptions"
  | "Housing"
  | "Debt Payment"
  | "Utilities"
  | "Health"
  | "Entertainment"
  | "Travel"
  | "Transfer"
  | "Other";

/**
 * Money moving between your own accounts — most importantly paying a credit
 * card from checking. The purchases were already counted when they hit the
 * card, so transfers are left out of spending, income, budgets and reviews
 * (same approach as Monarch and Copilot). Loan payments are NOT transfers:
 * they are real money out and live in "Debt Payment".
 */
export function isTransfer(t: { category: string; merchant: string }): boolean {
  return t.category === "Transfer" || (t.category === "Other" && t.merchant.toLowerCase().includes("transfer"));
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  institutionDomain?: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan";
  mask: string;
  balance: number; // positive = asset, negative = liability
}

/** How a transaction was paid, derived from the account it posted to. */
export type PaymentKind = "Credit card" | "Debit" | "Investment" | "Loan";

export function paymentKind(account: Pick<Account, "type">): PaymentKind {
  switch (account.type) {
    case "credit":
      return "Credit card";
    case "investment":
      return "Investment";
    case "loan":
      return "Loan";
    default:
      return "Debit"; // checking & savings: money straight out of the bank account
  }
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // ISO yyyy-mm-dd
  merchant: string;
  /** domain used for logo lookup (clearbit fallback) */
  merchantDomain?: string;
  /** logo url from Plaid enrichment, when available */
  logoUrl?: string;
  category: Category;
  /** negative = money out, positive = money in */
  amount: number;
  pending?: boolean;
  /** user chose to exclude this transaction from budgets & analytics */
  hidden?: boolean;
  /** true when merchant/category differ from Plaid's originals (edit or rule) */
  edited?: boolean;
}

export interface Rule {
  id: string;
  /** case-insensitive substring matched against the merchant name */
  match: string;
  setCategory?: Category;
  renameTo?: string;
}

export interface Budget {
  category: Category;
  monthlyLimit: number;
  /** carry unspent budget into the next month */
  rollover?: boolean;
}

export interface RecurringItem {
  merchant: string;
  merchantDomain?: string;
  logoUrl?: string;
  category: Category;
  averageAmount: number;
  cadence: "weekly" | "biweekly" | "monthly" | "yearly";
  lastDate: string;
  nextDate: string;
  occurrences: number;
}

export interface Holding {
  id: string;
  accountId: string;
  accountName?: string;
  name: string;
  ticker?: string;
  type?: string;
  quantity: number;
  value: number;
  costBasis?: number;
}

export interface ManualAsset {
  id: string;
  name: string;
  kind: "property" | "vehicle" | "cash" | "other" | "liability";
  /** entered positive; liabilities are counted negative toward net worth */
  value: number;
}

export interface NetWorthPoint {
  date: string; // ISO yyyy-mm-dd
  total: number;
  cash: number;
  investments: number;
  liabilities: number;
  manual: number;
}

export interface Goal {
  id: string;
  name: string;
  kind: "save" | "payoff";
  targetAmount: number;
  targetDate?: string;
  accountId?: string;
  startAmount: number;
  manualProgress: number;
  createdAt: string;
}

export interface AppData {
  mode: "demo" | "plaid";
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  rules?: Rule[];
  holdings?: Holding[];
  manualAssets?: ManualAsset[];
  goals?: Goal[];
  /** real recorded snapshots (daily); charts fall back to estimates when sparse */
  netWorthHistory?: NetWorthPoint[];
  /** true when editing features are available (database configured) */
  editable?: boolean;
  /** true when ANTHROPIC_API_KEY is configured (AI features available) */
  ai?: boolean;
}

/** Net worth including manual assets (liabilities entered positive count negative). */
export function totalNetWorth(data: Pick<AppData, "accounts" | "manualAssets">): number {
  const accounts = data.accounts.reduce((s, a) => s + a.balance, 0);
  const manual = (data.manualAssets ?? []).reduce(
    (s, m) => s + (m.kind === "liability" ? -Math.abs(m.value) : m.value),
    0
  );
  return accounts + manual;
}
