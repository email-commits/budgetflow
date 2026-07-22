import { generateDemoData, BUDGETS } from "./mockData";
import { aiEnabled } from "./ai";
import { dbConfigured, getDb } from "./db";
import { syncAll } from "./sync";
import {
  getPlaidClient,
  hasLinkedItem,
  mapPlaidAccount,
  mapPlaidTransaction,
  plaidConfigured,
  readStore,
} from "./plaid";
import { Account, AppData, Budget, Category, Rule, Transaction } from "./types";

/**
 * Fetch app data.
 * - With DATABASE_URL: incremental Plaid sync into Postgres, then serve from the DB
 *   (fast, persistent, multi-bank).
 * - Without: legacy direct-from-Plaid fetch, or demo data when nothing is linked.
 */
export async function getAppData(force = false): Promise<AppData> {
  let result: AppData | null = null;
  if (dbConfigured()) {
    try {
      result = await getAppDataFromDb(force);
    } catch (e) {
      console.error("DB path failed, falling back:", e);
    }
  }
  if (!result) result = await getAppDataLegacy();
  result.ai = aiEnabled();
  return result;
}

async function getAppDataFromDb(force: boolean): Promise<AppData> {
  const db = getDb();
  await syncAll(force);

  const [accounts, transactions, itemCount, ruleRows, holdingRows, manualRows, snapshotRows, goalRows] =
    await Promise.all([
      db.account.findMany(),
      db.transaction.findMany({ orderBy: { date: "desc" }, take: 5000 }),
      db.plaidItem.count(),
      db.rule.findMany({ orderBy: { createdAt: "asc" } }),
      db.holding.findMany({ include: { account: { select: { name: true } } } }),
      db.manualAsset.findMany({ orderBy: { name: "asc" } }),
      db.netWorthSnapshot.findMany({ orderBy: { date: "asc" }, take: 730 }),
      db.goal.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

  if (itemCount === 0) return generateDemoData();

  const rules: Rule[] = ruleRows.map((r) => ({
    id: r.id,
    match: r.match,
    setCategory: (r.setCategory as Category) ?? undefined,
    renameTo: r.renameTo ?? undefined,
  }));

  // budgets live in the DB (seeded from defaults on first run)
  let budgetRows = await db.budget.findMany();
  if (budgetRows.length === 0) {
    await db.budget.createMany({ data: BUDGETS.map((b) => ({ category: b.category, monthlyLimit: b.monthlyLimit })) });
    budgetRows = await db.budget.findMany();
  }
  const budgets: Budget[] = budgetRows.map((b) => ({
    category: b.category as Category,
    monthlyLimit: b.monthlyLimit,
    rollover: b.rollover || undefined,
  }));

  return {
    mode: "plaid",
    editable: true,
    rules,
    holdings: holdingRows.map((h) => ({
      id: h.id,
      accountId: h.accountId,
      accountName: h.account.name,
      name: h.name,
      ticker: h.ticker ?? undefined,
      type: h.type ?? undefined,
      quantity: h.quantity,
      value: h.value,
      costBasis: h.costBasis ?? undefined,
    })),
    manualAssets: manualRows.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind as "property" | "vehicle" | "cash" | "other" | "liability",
      value: m.value,
    })),
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind as "save" | "payoff",
      targetAmount: g.targetAmount,
      targetDate: g.targetDate ?? undefined,
      accountId: g.accountId ?? undefined,
      startAmount: g.startAmount,
      manualProgress: g.manualProgress,
      createdAt: g.createdAt.toISOString().slice(0, 10),
    })),
    netWorthHistory: snapshotRows.map((s) => ({
      date: s.date,
      total: s.total,
      cash: s.cash,
      investments: s.investments,
      liabilities: s.liabilities,
      manual: s.manual,
    })),
    accounts: accounts.map(
      (a): Account => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        institutionDomain: a.institutionDomain ?? undefined,
        type: a.type as Account["type"],
        mask: a.mask,
        balance: a.balance,
      })
    ),
    transactions: transactions.map((t) => applyEdits(t, rules)),
    budgets,
  };
}

interface DbTransaction {
  id: string;
  accountId: string;
  date: string;
  merchant: string;
  merchantDomain: string | null;
  logoUrl: string | null;
  category: string;
  amount: number;
  pending: boolean;
  categoryOverride: string | null;
  merchantOverride: string | null;
  hidden: boolean;
}

/** Precedence: per-transaction override > matching rule > Plaid's original value. */
function applyEdits(t: DbTransaction, rules: Rule[]): Transaction {
  const rule = rules.find((r) => t.merchant.toLowerCase().includes(r.match.toLowerCase()));
  const merchant = t.merchantOverride ?? rule?.renameTo ?? t.merchant;
  const category = (t.categoryOverride as Category) ?? rule?.setCategory ?? (t.category as Category);
  const edited = merchant !== t.merchant || category !== t.category;
  return {
    id: t.id,
    accountId: t.accountId,
    date: t.date,
    merchant,
    merchantDomain: t.merchantDomain ?? undefined,
    logoUrl: t.logoUrl ?? undefined,
    category,
    amount: t.amount,
    pending: t.pending || undefined,
    hidden: t.hidden || undefined,
    edited: edited || undefined,
  };
}

// ---- legacy path (no database) ----

async function getAppDataLegacy(): Promise<AppData> {
  if (!plaidConfigured() || !hasLinkedItem()) {
    return generateDemoData();
  }
  try {
    const client = getPlaidClient();
    const store = readStore();
    const accounts: Account[] = [];
    const transactions: Transaction[] = [];

    for (const item of store.items) {
      let institution: { name?: string; domain?: string } | undefined;
      try {
        const itemResp = await client.itemGet({ access_token: item.accessToken });
        const instId = itemResp.data.item.institution_id;
        if (instId) {
          const instResp = await client.institutionsGetById({
            institution_id: instId,
            country_codes: ["US"] as never,
            options: { include_optional_metadata: true },
          });
          institution = {
            name: instResp.data.institution.name,
            domain: instResp.data.institution.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""),
          };
        }
      } catch {
        /* optional */
      }

      const acctResp = await client.accountsGet({ access_token: item.accessToken });
      for (const a of acctResp.data.accounts) accounts.push(mapPlaidAccount(a, institution));

      let cursor: string | undefined = undefined;
      let hasMore = true;
      while (hasMore) {
        const resp = await client.transactionsSync({ access_token: item.accessToken, cursor, count: 500 });
        for (const t of resp.data.added) transactions.push(mapPlaidTransaction(t));
        cursor = resp.data.next_cursor;
        hasMore = resp.data.has_more;
      }
    }

    transactions.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { mode: "plaid", accounts, transactions, budgets: BUDGETS };
  } catch (e) {
    console.error("Plaid fetch failed, serving demo data:", e);
    return generateDemoData();
  }
}
