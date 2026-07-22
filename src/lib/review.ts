import { spendByCategory } from "./analytics";
import { AppData, Budget, Category, Transaction } from "./types";

export interface MonthlyReview {
  monthKey: string; // yyyy-mm
  totalSpend: number;
  avgSpend: number; // average of up to 3 prior months
  totalIncome: number;
  savingsRate: number; // (income - spend) / income, 0 when no income
  grade: "A" | "B" | "C" | "D";
  categories: { category: Category; total: number; avg: number; delta: number }[];
  topMerchants: { merchant: string; total: number; count: number }[];
  topPurchases: Transaction[];
  budgets: { category: Category; limit: number; spent: number; over: boolean }[];
  budgetsOver: number;
}

function isTransfer(t: Transaction): boolean {
  return t.hidden === true || t.merchant.toLowerCase().includes("transfer");
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computeMonthlyReview(data: AppData, monthKey: string): MonthlyReview {
  const txs = data.transactions;
  const inMonth = (t: Transaction) => t.date.startsWith(monthKey);

  const monthTx = txs.filter((t) => inMonth(t) && !isTransfer(t));
  const spendTx = monthTx.filter((t) => t.amount < 0);
  const totalSpend = spendTx.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const savingsRate = totalIncome > 0 ? (totalIncome - totalSpend) / totalIncome : 0;

  // prior-3-month average (only months that have any activity)
  const priorKeys = [shiftMonth(monthKey, -1), shiftMonth(monthKey, -2), shiftMonth(monthKey, -3)];
  const priorTotals = priorKeys
    .map((k) =>
      txs
        .filter((t) => t.date.startsWith(k) && !isTransfer(t) && t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
    )
    .filter((v) => v > 0);
  const avgSpend = priorTotals.length > 0 ? priorTotals.reduce((a, b) => a + b, 0) / priorTotals.length : totalSpend;

  // category deltas vs prior average
  const cur = new Map(spendByCategory(txs, monthKey).map((c) => [c.category, c.total]));
  const priorByCat = new Map<Category, number[]>();
  for (const k of priorKeys) {
    for (const c of spendByCategory(txs, k)) {
      if (!priorByCat.has(c.category)) priorByCat.set(c.category, []);
      priorByCat.get(c.category)!.push(c.total);
    }
  }
  const allCats = new Set<Category>([...cur.keys(), ...priorByCat.keys()]);
  const categories = [...allCats]
    .map((category) => {
      const total = cur.get(category) ?? 0;
      const hist = priorByCat.get(category) ?? [];
      const avg = hist.length > 0 ? hist.reduce((a, b) => a + b, 0) / hist.length : total;
      return { category, total, avg, delta: total - avg };
    })
    .sort((a, b) => b.total - a.total);

  // top merchants
  const byMerchant = new Map<string, { total: number; count: number }>();
  for (const t of spendTx) {
    const e = byMerchant.get(t.merchant) ?? { total: 0, count: 0 };
    e.total += Math.abs(t.amount);
    e.count += 1;
    byMerchant.set(t.merchant, e);
  }
  const topMerchants = [...byMerchant.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const topPurchases = [...spendTx].sort((a, b) => a.amount - b.amount).slice(0, 5);

  // budget results
  const budgets = (data.budgets ?? []).map((b: Budget) => {
    const spent = cur.get(b.category) ?? 0;
    return { category: b.category, limit: b.monthlyLimit, spent, over: spent > b.monthlyLimit };
  });
  const budgetsOver = budgets.filter((b) => b.over).length;

  // grade: savings rate anchored, demoted for blown budgets
  let grade: MonthlyReview["grade"];
  if (savingsRate >= 0.2) grade = "A";
  else if (savingsRate >= 0.1) grade = "B";
  else if (savingsRate >= 0) grade = "C";
  else grade = "D";
  if (budgetsOver >= 3 && grade !== "D") {
    grade = grade === "A" ? "B" : grade === "B" ? "C" : "D";
  }

  return {
    monthKey,
    totalSpend,
    avgSpend,
    totalIncome,
    savingsRate,
    grade,
    categories,
    topMerchants,
    topPurchases,
    budgets,
    budgetsOver,
  };
}

export function monthTitle(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export { shiftMonth };
