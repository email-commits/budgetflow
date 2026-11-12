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

/** Plaid primary category -> app category, when the detailed code has no entry below. */
const PFC_PRIMARY: Record<string, Category> = {
  INCOME: "Other Income",
  TRANSFER_IN: "Uncategorized",
  TRANSFER_OUT: "Uncategorized",
  LOAN_PAYMENTS: "Loan Repayment",
  BANK_FEES: "Financial Fees",
  ENTERTAINMENT: "Entertainment & Recreation",
  FOOD_AND_DRINK: "Restaurants & Bars",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home Improvement",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: "Miscellaneous",
  GOVERNMENT_AND_NON_PROFIT: "Miscellaneous",
  TRANSPORTATION: "Other Transport",
  TRAVEL: "Travel & Vacation",
  RENT_AND_UTILITIES: "Other Utilities",
};

/** Plaid detailed category -> app category (only where it differs from the primary default). */
const PFC_DETAILED: Record<string, Category> = {
  INCOME_WAGES: "Paychecks",
  INCOME_INTEREST_EARNED: "Interest",
  // moves between your own accounts; other transfers stay Uncategorized so
  // person-to-person payments (Venmo, Zelle) are not silently dropped from spending
  TRANSFER_IN_SAVINGS: "Transfer",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer",
  TRANSFER_IN_CASH_ADVANCES_AND_LOANS: "Transfer",
  TRANSFER_OUT_SAVINGS: "Transfer",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer",
  TRANSFER_OUT_WITHDRAWAL: "Cash & ATM",
  // paying a card is a transfer: the purchases were already counted on the card
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Credit Card Payment",
  LOAN_PAYMENTS_CAR_PAYMENT: "Auto Payment",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Mortgage",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Student Loans",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_COFFEE: "Coffee Shops",
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Clothing",
  GENERAL_MERCHANDISE_ELECTRONICS: "Electronics",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "Pets",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts",
  HOME_IMPROVEMENT_FURNITURE: "Furniture & Housewares",
  MEDICAL_DENTAL_CARE: "Dentist",
  MEDICAL_VETERINARY_SERVICES: "Pets",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Fitness",
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_CHILDCARE: "Child Care",
  GENERAL_SERVICES_EDUCATION: "Education",
  GENERAL_SERVICES_AUTOMOTIVE: "Auto Maintenance",
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Financial & Legal Services",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Financial & Legal Services",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Charity",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes",
  TRANSPORTATION_GAS: "Gas",
  TRANSPORTATION_PARKING: "Parking & Tolls",
  TRANSPORTATION_TOLLS: "Parking & Tolls",
  TRANSPORTATION_PUBLIC_TRANSIT: "Public Transit",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Taxi & Ride Shares",
  RENT_AND_UTILITIES_RENT: "Rent",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Gas & Electric",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet & Cable",
  RENT_AND_UTILITIES_TELEPHONE: "Phone",
  RENT_AND_UTILITIES_WATER: "Water & Garbage",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Water & Garbage",
};

/** Plaid personal_finance_category -> app category (always one of the built-in defaults). */
export function mapPlaidCategory(primary?: string | null, detailed?: string | null): Category {
  return (detailed && PFC_DETAILED[detailed]) || (primary && PFC_PRIMARY[primary]) || "Uncategorized";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPlaidTransaction(t: any): Transaction {
  const category = mapPlaidCategory(t.personal_finance_category?.primary, t.personal_finance_category?.detailed);
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
