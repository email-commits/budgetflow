export type Category =
  | "Income"
  | "Groceries"
  | "Shopping"
  | "Dining"
  | "Transport"
  | "Subscriptions"
  | "Housing"
  | "Utilities"
  | "Health"
  | "Entertainment"
  | "Travel"
  | "Other";

export interface Account {
  id: string;
  name: string;
  institution: string;
  institutionDomain?: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan";
  mask: string;
  balance: number; // positive = asset, negative = liability
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
}

export interface Budget {
  category: Category;
  monthlyLimit: number;
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

export interface AppData {
  mode: "demo" | "plaid";
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
}
