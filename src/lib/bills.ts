import { Transaction } from "./types";

export interface Bill {
  id: string;
  name: string;
  match: string;
  expectedAmount: number;
  tolerance: number;
  dueDay: number;
  active: boolean;
  /** exact amount the biller says is due this cycle (pulled from their site) */
  statementAmount?: number | null;
  statementDate?: string | null;
  planInfo?: string | null;
}

export type BillState = "paid" | "overpaid" | "underpaid" | "upcoming" | "due-soon" | "missed";

export interface BillStatus {
  bill: Bill;
  state: BillState;
  dueDate: string; // this cycle's due date, ISO
  daysUntilDue: number; // negative = past due
  paidAmount?: number;
  paidDate?: string;
  /** paidAmount - expectedAmount when paid (positive = paid more) */
  variance?: number;
  /** average of previous payments (before this cycle), for trend context */
  historicalAvg?: number;
  paymentsFound: number;
  /** true when this cycle was verified against the biller's own statement amount */
  statementVerified?: boolean;
}

const GRACE_DAYS = 3;
const DUE_SOON_DAYS = 7;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clampedDueDate(year: number, monthIdx: number, dueDay: number): Date {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  return new Date(Date.UTC(year, monthIdx, Math.min(dueDay, daysInMonth)));
}

/** Evaluate one bill for the current monthly cycle. */
export function billStatus(bill: Bill, txs: Transaction[], now = new Date()): BillStatus {
  const dueThisMonth = clampedDueDate(now.getUTCFullYear(), now.getUTCMonth(), bill.dueDay);
  // If this month's due date is long past (beyond grace + settle window),
  // the relevant cycle is next month's.
  const msDay = 86400000;
  let dueDate = dueThisMonth;
  if ((now.getTime() - dueThisMonth.getTime()) / msDay > 20) {
    dueDate = clampedDueDate(now.getUTCFullYear(), now.getUTCMonth() + 1, bill.dueDay);
  }

  // payment window: 20 days before due through grace after
  const windowStart = new Date(dueDate.getTime() - 20 * msDay);
  const windowEnd = new Date(dueDate.getTime() + (GRACE_DAYS + 7) * msDay);
  const matches = (t: Transaction) =>
    !t.hidden && t.amount < 0 && t.merchant.toLowerCase().includes(bill.match.toLowerCase());

  const inWindow = txs.filter(
    (t) => matches(t) && t.date >= iso(windowStart) && t.date <= iso(windowEnd)
  );
  const prior = txs.filter((t) => matches(t) && t.date < iso(windowStart));
  const historicalAvg =
    prior.length > 0 ? prior.reduce((s, t) => s + Math.abs(t.amount), 0) / prior.length : undefined;

  const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / msDay);

  // If a statement from the biller applies to this cycle, verify against it
  // exactly (±$1) instead of the tolerance band around the expected amount.
  const statementApplies =
    bill.statementAmount != null &&
    bill.statementAmount > 0 &&
    (!bill.statementDate ||
      Math.abs(new Date(bill.statementDate + "T12:00:00Z").getTime() - dueDate.getTime()) / msDay <= 35);
  const target = statementApplies ? bill.statementAmount! : bill.expectedAmount;
  const tolAmt = statementApplies ? 1 : bill.expectedAmount * bill.tolerance;

  if (inWindow.length > 0) {
    const paidAmount = inWindow.reduce((s, t) => s + Math.abs(t.amount), 0);
    const latest = inWindow.reduce((a, b) => (a.date > b.date ? a : b));
    const variance = paidAmount - target;
    let state: BillState = "paid";
    if (variance > tolAmt && variance > 1) state = "overpaid";
    else if (variance < -tolAmt && Math.abs(variance) > 1) state = "underpaid";
    return {
      bill,
      state,
      dueDate: iso(dueDate),
      daysUntilDue,
      paidAmount,
      paidDate: latest.date,
      variance,
      historicalAvg,
      paymentsFound: inWindow.length,
      statementVerified: statementApplies || undefined,
    };
  }

  let state: BillState;
  if (daysUntilDue < -GRACE_DAYS) state = "missed";
  else if (daysUntilDue <= DUE_SOON_DAYS) state = "due-soon";
  else state = "upcoming";

  return { bill, state, dueDate: iso(dueDate), daysUntilDue, historicalAvg, paymentsFound: 0 };
}

export function billAlerts(statuses: BillStatus[]): { title: string; detail: string }[] {
  const alerts: { title: string; detail: string }[] = [];
  for (const s of statuses) {
    if (s.state === "missed") {
      alerts.push({
        title: `Missed bill: ${s.bill.name}`,
        detail: `Was due ${s.dueDate} (~${fmt(s.bill.expectedAmount)}) — no matching payment found`,
      });
    } else if (s.state === "overpaid") {
      const ref = s.statementVerified ? `the biller's statement (${fmt(s.bill.statementAmount ?? 0)})` : `expected ${fmt(s.bill.expectedAmount)}`;
      alerts.push({
        title: `Overpaid: ${s.bill.name}`,
        detail: `Paid ${fmt(s.paidAmount ?? 0)} vs ${ref} (+${fmt(s.variance ?? 0)})`,
      });
    } else if (s.state === "underpaid") {
      const ref = s.statementVerified ? `the biller's statement (${fmt(s.bill.statementAmount ?? 0)})` : `expected ${fmt(s.bill.expectedAmount)}`;
      alerts.push({
        title: `Underpaid: ${s.bill.name}`,
        detail: `Paid ${fmt(s.paidAmount ?? 0)} vs ${ref} — partial payment?`,
      });
    }
  }
  return alerts;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
