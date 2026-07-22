import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import fs from "fs";
import path from "path";
import { Account, Category, Transaction } from "./types";

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient(): PlaidApi {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  });
  return new PlaidApi(configuration);
}

// ---- dev-only token store (swap for a real DB in production) ----
const STORE_PATH = path.join(process.cwd(), ".plaid-store.json");

interface Store {
  items: { accessToken: string; itemId: string; cursor?: string }[];
}

export function readStore(): Store {
  try {
    const store: Store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (store.items.length > 0) return store;
  } catch {
    /* fall through to env */
  }
  // Serverless-friendly fallback (Vercel etc. have no persistent disk):
  // set PLAID_ACCESS_TOKEN from your linked item and it is used directly.
  if (process.env.PLAID_ACCESS_TOKEN) {
    return {
      items: [
        {
          accessToken: process.env.PLAID_ACCESS_TOKEN,
          itemId: process.env.PLAID_ITEM_ID ?? "env-item",
        },
      ],
    };
  }
  return { items: [] };
}

/** Returns true if the store was persisted to disk (false on read-only filesystems like Vercel). */
export function writeStore(store: Store): boolean {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return true;
  } catch (e) {
    console.warn(
      "Could not persist Plaid store (read-only filesystem). " +
        "Set PLAID_ACCESS_TOKEN in your environment instead.",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

export function hasLinkedItem(): boolean {
  return readStore().items.length > 0;
}

// ---- mapping Plaid -> app types ----

const PFC_MAP: Record<string, Category> = {
  INCOME: "Income",
  FOOD_AND_DRINK: "Dining",
  GENERAL_MERCHANDISE: "Shopping",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Utilities",
  ENTERTAINMENT: "Entertainment",
  MEDICAL: "Health",
  PERSONAL_CARE: "Health",
  GENERAL_SERVICES: "Other",
  GOVERNMENT_AND_NON_PROFIT: "Other",
  HOME_IMPROVEMENT: "Shopping",
  LOAN_PAYMENTS: "Housing",
  BANK_FEES: "Other",
  TRANSFER_IN: "Other",
  TRANSFER_OUT: "Other",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPlaidTransaction(t: any): Transaction {
  const pfc: string | undefined = t.personal_finance_category?.primary;
  let category: Category = (pfc && PFC_MAP[pfc]) || "Other";
  if (pfc === "FOOD_AND_DRINK" && t.personal_finance_category?.detailed?.includes("GROCERIES")) {
    category = "Groceries";
  }
  const domain = t.website ?? undefined;
  return {
    id: t.transaction_id,
    accountId: t.account_id,
    date: t.date,
    merchant: t.merchant_name || t.name,
    merchantDomain: domain,
    logoUrl: t.logo_url ?? t.personal_finance_category_icon_url ?? undefined,
    category,
    // Plaid: positive = money out. Our app: negative = money out.
    amount: -t.amount,
    pending: t.pending || undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPlaidAccount(a: any, institution?: { name?: string; domain?: string }): Account {
  const subtype: string = a.subtype ?? "";
  const type: Account["type"] =
    a.type === "credit" ? "credit"
    : a.type === "loan" ? "loan"
    : a.type === "investment" ? "investment"
    : subtype === "savings" ? "savings"
    : "checking";
  const raw = a.balances?.current ?? 0;
  // credit and loan balances are amounts owed -> liabilities (negative)
  const liability = type === "credit" || type === "loan";
  return {
    id: a.account_id,
    name: a.name,
    institution: institution?.name ?? "Bank",
    institutionDomain: institution?.domain,
    type,
    mask: a.mask ?? "0000",
    balance: liability ? -Math.abs(raw) : raw,
  };
}
