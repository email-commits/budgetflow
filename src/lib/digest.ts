import { CATEGORY_COLORS, detectRecurring, fmtUSD } from "./analytics";
import { AppData, Category, Transaction } from "./types";

export interface WeeklyDigest {
  startDate: string;
  endDate: string;
  totalSpend: number;
  totalIncome: number;
  prevWeekSpend: number;
  byCategory: { category: Category; total: number }[];
  topPurchases: Transaction[];
  upcoming: { merchant: string; date: string; amount: number }[];
  netWorth: number;
}

function isTransfer(t: Transaction): boolean {
  return t.merchant.toLowerCase().includes("transfer");
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute highlights for the 7 full days ending yesterday (relative to runDate). */
export function computeWeeklyDigest(data: AppData, runDate = new Date()): WeeklyDigest {
  const end = new Date(runDate);
  end.setDate(end.getDate() - 1); // through yesterday
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - 6);

  const inRange = (t: Transaction, a: Date, b: Date) => t.date >= iso(a) && t.date <= iso(b);

  const week = data.transactions.filter((t) => inRange(t, start, end) && !isTransfer(t));
  const prevWeek = data.transactions.filter((t) => inRange(t, prevStart, prevEnd) && !isTransfer(t));

  const spendTx = week.filter((t) => t.amount < 0);
  const totalSpend = spendTx.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = week.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevWeekSpend = prevWeek.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const catMap = new Map<Category, number>();
  for (const t of spendTx) catMap.set(t.category, (catMap.get(t.category) ?? 0) + Math.abs(t.amount));
  const byCategory = [...catMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const topPurchases = [...spendTx].sort((a, b) => a.amount - b.amount).slice(0, 5);

  const weekAhead = new Date(runDate);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const upcoming = detectRecurring(data.transactions)
    .filter((r) => r.nextDate >= iso(runDate) && r.nextDate <= iso(weekAhead))
    .slice(0, 6)
    .map((r) => ({ merchant: r.merchant, date: r.nextDate, amount: r.averageAmount }));

  return {
    startDate: iso(start),
    endDate: iso(end),
    totalSpend,
    totalIncome,
    prevWeekSpend,
    byCategory,
    topPurchases,
    upcoming,
    netWorth: data.accounts.reduce((s, a) => s + a.balance, 0),
  };
}

const fmtDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Render the digest as a self-contained HTML email (inline styles, email-client-safe). */
export function renderDigestEmail(d: WeeklyDigest): { subject: string; html: string } {
  const delta = d.totalSpend - d.prevWeekSpend;
  const deltaPct = d.prevWeekSpend > 0 ? Math.round((delta / d.prevWeekSpend) * 100) : 0;
  const deltaLine =
    d.prevWeekSpend <= 0
      ? ""
      : delta <= 0
        ? `<span style="color:#0a7a0a;">▼ ${fmtUSD(Math.abs(delta))} (${Math.abs(deltaPct)}%) less than last week</span>`
        : `<span style="color:#c22525;">▲ ${fmtUSD(delta)} (${deltaPct}%) more than last week</span>`;

  const maxCat = d.byCategory[0]?.total ?? 1;
  const catRows = d.byCategory
    .slice(0, 6)
    .map(
      (c) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-size:14px;color:#333;white-space:nowrap;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${CATEGORY_COLORS[c.category]};margin-right:7px;"></span>${c.category}
        </td>
        <td style="width:100%;padding:6px 0;">
          <div style="background:#eee;border-radius:6px;height:9px;">
            <div style="width:${Math.max(4, Math.round((c.total / maxCat) * 100))}%;background:${CATEGORY_COLORS[c.category]};height:9px;border-radius:6px;"></div>
          </div>
        </td>
        <td style="padding:6px 0 6px 12px;font-size:14px;color:#111;text-align:right;white-space:nowrap;">${fmtUSD(c.total, 0)}</td>
      </tr>`
    )
    .join("");

  const purchaseRows = d.topPurchases
    .map(
      (t) => `
      <tr>
        <td style="padding:7px 0;font-size:14px;color:#111;">${t.merchant}
          <span style="color:#888;font-size:12px;"> · ${fmtDay(t.date)} · ${t.category}</span>
        </td>
        <td style="padding:7px 0;font-size:14px;color:#111;text-align:right;white-space:nowrap;">${fmtUSD(Math.abs(t.amount))}</td>
      </tr>`
    )
    .join("");

  const upcomingRows = d.upcoming.length
    ? d.upcoming
        .map(
          (u) => `
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#111;">${u.merchant}
          <span style="color:#888;font-size:12px;"> · ${fmtDay(u.date)}</span>
        </td>
        <td style="padding:6px 0;font-size:14px;color:#111;text-align:right;white-space:nowrap;">${fmtUSD(u.amount)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td style="padding:6px 0;font-size:14px;color:#888;">Nothing detected in the next 7 days.</td></tr>`;

  const subject = `Your week in money · ${fmtDay(d.startDate)}–${fmtDay(d.endDate)} · ${fmtUSD(d.totalSpend, 0)} spent`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 4px 14px;">
          <span style="display:inline-block;width:26px;height:26px;border-radius:8px;background:#2a78d6;color:#fff;text-align:center;line-height:26px;font-weight:700;font-size:14px;">B</span>
          <span style="font-size:17px;font-weight:600;color:#111;vertical-align:middle;margin-left:8px;">BudgetFlow · Weekly digest</span>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6e6e2;">
          <div style="font-size:13px;color:#888;">${fmtDay(d.startDate)} – ${fmtDay(d.endDate)}</div>
          <div style="font-size:34px;font-weight:700;color:#111;margin-top:4px;">${fmtUSD(d.totalSpend, 0)} <span style="font-size:15px;font-weight:400;color:#888;">spent this week</span></div>
          <div style="font-size:13px;margin-top:6px;">${deltaLine}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
            <tr>
              <td style="font-size:13px;color:#888;">Income</td>
              <td style="font-size:13px;color:#888;">Net worth</td>
            </tr>
            <tr>
              <td style="font-size:19px;font-weight:600;color:#0a7a0a;">${fmtUSD(d.totalIncome, 0)}</td>
              <td style="font-size:19px;font-weight:600;color:#111;">${fmtUSD(d.netWorth, 0)}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="height:14px;"></td></tr>
        <tr><td style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6e6e2;">
          <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:10px;">Where it went</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${catRows}</table>
        </td></tr>

        <tr><td style="height:14px;"></td></tr>
        <tr><td style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6e6e2;">
          <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">Biggest purchases</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${purchaseRows}</table>
        </td></tr>

        <tr><td style="height:14px;"></td></tr>
        <tr><td style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6e6e2;">
          <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:6px;">Coming up this week</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${upcomingRows}</table>
        </td></tr>

        <tr><td style="padding:16px 4px;color:#999;font-size:12px;">
          Sent automatically every Sunday by your BudgetFlow app.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
