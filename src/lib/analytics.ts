import { Category, RecurringItem, Transaction } from "./types";

export const CATEGORY_COLORS: Record<Category, string> = {
  Income: "#008300",
  Groceries: "#199e70",
  Shopping: "#3987e5",
  Dining: "#c98500",
  Transport: "#9085e9",
  Subscriptions: "#d55181",
  Housing: "#d95926",
  Utilities: "#e66767",
  Health: "#0ca30c",
  Entertainment: "#86b6ef",
  Travel: "#1baf7a",
  Other: "#898781",
};

export const fmtUSD = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtUSD0 = (n: number) => fmtUSD(n, 0);

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function inMonth(t: Transaction, key: string): boolean {
  return t.date.startsWith(key);
}

/** spending (money out, excluding transfers) grouped by category for a month */
export function spendByCategory(txs: Transaction[], key: string): { category: Category; total: number }[] {
  const map = new Map<Category, number>();
  for (const t of txs) {
    if (t.hidden) continue;
    if (!inMonth(t, key) || t.amount >= 0) continue;
    if (t.category === "Other" && t.merchant.toLowerCase().includes("transfer")) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** income vs spend per month, oldest first */
export function monthlyCashFlow(txs: Transaction[]): { month: string; income: number; spend: number; net: number }[] {
  const map = new Map<string, { income: number; spend: number }>();
  for (const t of txs) {
    if (t.hidden) continue;
    if (t.category === "Other" && t.merchant.toLowerCase().includes("transfer")) continue;
    const k = monthKey(t.date);
    const e = map.get(k) ?? { income: 0, spend: 0 };
    if (t.amount > 0) e.income += t.amount;
    else e.spend += Math.abs(t.amount);
    map.set(k, e);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({ month, income: v.income, spend: v.spend, net: v.income - v.spend }));
}

/** rough net-worth history: current balance walked backwards through net cash flow */
export function netWorthSeries(txs: Transaction[], currentNetWorth: number): { month: string; value: number }[] {
  const flow = monthlyCashFlow(txs);
  const out: { month: string; value: number }[] = [];
  let v = currentNetWorth;
  for (let i = flow.length - 1; i >= 0; i--) {
    out.unshift({ month: flow[i].month, value: v });
    v -= flow[i].net;
  }
  return out;
}

const CADENCE_DAYS: [RecurringItem["cadence"], number, number][] = [
  ["weekly", 5, 9],
  ["biweekly", 12, 17],
  ["monthly", 26, 35],
  ["yearly", 350, 380],
];

/** detect recurring charges: same merchant, similar amount, regular interval */
export function detectRecurring(txs: Transaction[]): RecurringItem[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.hidden || t.amount >= 0) continue;
    if (!byMerchant.has(t.merchant)) byMerchant.set(t.merchant, []);
    byMerchant.get(t.merchant)!.push(t);
  }

  const items: RecurringItem[] = [];
  for (const [merchant, list] of byMerchant) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const amounts = sorted.map((t) => Math.abs(t.amount));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    // amounts must be stable (within 20% of average)
    if (!amounts.every((a) => Math.abs(a - avg) / avg < 0.2)) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const cadence = CADENCE_DAYS.find(([, lo, hi]) => avgGap >= lo && avgGap <= hi)?.[0];
    if (!cadence) continue;

    const last = sorted[sorted.length - 1];
    const next = new Date(last.date);
    next.setDate(next.getDate() + Math.round(avgGap));
    items.push({
      merchant,
      merchantDomain: last.merchantDomain,
      logoUrl: last.logoUrl,
      category: last.category,
      averageAmount: Math.round(avg * 100) / 100,
      cadence,
      lastDate: last.date,
      nextDate: next.toISOString().slice(0, 10),
      occurrences: sorted.length,
    });
  }
  return items.sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}
