import { Transaction } from "./types";

export interface Anomaly {
  kind: "large" | "duplicate" | "price-hike";
  title: string;
  detail: string;
  amount: number;
  date: string;
  merchant: string;
}

/**
 * Detect notable spending anomalies in a recent window (default 14 days):
 * - unusually large charges (vs. the merchant's own history and overall spending)
 * - possible duplicate charges (same merchant + amount within 2 days)
 * - subscription price hikes (recurring charge jumped >8% and >$1)
 */
export function detectAnomalies(txs: Transaction[], windowDays = 14, now = new Date()): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const visible = txs.filter((t) => !t.hidden && t.amount < 0 && !t.merchant.toLowerCase().includes("transfer"));
  const recent = visible.filter((t) => t.date >= cutoffIso);
  const historical = visible.filter((t) => t.date < cutoffIso);

  // --- large charges: > mean + 3σ of historical spend sizes, and > $100 ---
  if (historical.length >= 20) {
    const sizes = historical.map((t) => Math.abs(t.amount));
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sd = Math.sqrt(sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / sizes.length);
    const threshold = Math.max(100, mean + 3 * sd);

    // per-merchant history: skip if this size is normal for that merchant (e.g. rent)
    const merchantAvg = new Map<string, number>();
    const merchantCount = new Map<string, number>();
    for (const t of historical) {
      const n = merchantCount.get(t.merchant) ?? 0;
      const avg = merchantAvg.get(t.merchant) ?? 0;
      merchantAvg.set(t.merchant, (avg * n + Math.abs(t.amount)) / (n + 1));
      merchantCount.set(t.merchant, n + 1);
    }

    for (const t of recent) {
      const size = Math.abs(t.amount);
      if (size < threshold) continue;
      const mAvg = merchantAvg.get(t.merchant);
      const mCount = merchantCount.get(t.merchant) ?? 0;
      if (mCount >= 3 && mAvg !== undefined && size < mAvg * 1.5) continue; // normal for this merchant
      anomalies.push({
        kind: "large",
        title: `Unusually large: ${t.merchant}`,
        detail: `${fmt(size)} on ${t.date} — well above your typical charge (~${fmt(mean)})`,
        amount: -size,
        date: t.date,
        merchant: t.merchant,
      });
    }
  }

  // --- duplicates: same merchant + same amount within 2 days ---
  const seen = new Map<string, Transaction>();
  for (const t of [...recent].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const key = `${t.merchant}|${Math.abs(t.amount).toFixed(2)}`;
    const prev = seen.get(key);
    if (prev && daysBetween(prev.date, t.date) <= 2 && prev.id !== t.id && Math.abs(t.amount) >= 10) {
      anomalies.push({
        kind: "duplicate",
        title: `Possible duplicate: ${t.merchant}`,
        detail: `${fmt(Math.abs(t.amount))} charged twice (${prev.date} and ${t.date})`,
        amount: t.amount,
        date: t.date,
        merchant: t.merchant,
      });
    }
    seen.set(key, t);
  }

  // --- subscription price hikes (own cadence check: a hiked amount would fail
  // the recurring detector's stability filter, so we can't reuse it) ---
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of visible) {
    if (!byMerchant.has(t.merchant)) byMerchant.set(t.merchant, []);
    byMerchant.get(t.merchant)!.push(t);
  }
  for (const [merchant, list] of byMerchant) {
    if (list.length < 3) continue;
    const charges = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const latestTx = charges[charges.length - 1];
    if (latestTx.date < cutoffIso) continue; // only alert on fresh charges
    // regular cadence? (weekly to ~monthly-ish gaps, consistent)
    const gaps: number[] = [];
    for (let i = 1; i < charges.length; i++) gaps.push(daysBetween(charges[i - 1].date, charges[i].date));
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap < 5 || avgGap > 40) continue;
    if (!gaps.every((g) => Math.abs(g - avgGap) <= avgGap * 0.35 + 3)) continue;
    // prior amounts stable, latest jumped
    const prior = charges.slice(0, -1).map((t) => Math.abs(t.amount));
    const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (!prior.every((p) => Math.abs(p - priorAvg) / priorAvg < 0.1)) continue;
    const latest = Math.abs(latestTx.amount);
    if (latest > priorAvg * 1.08 && latest - priorAvg >= 1) {
      anomalies.push({
        kind: "price-hike",
        title: `Price hike: ${merchant}`,
        detail: `Now ${fmt(latest)} — was averaging ${fmt(priorAvg)} (${Math.round(((latest - priorAvg) / priorAvg) * 100)}% more)`,
        amount: -latest,
        date: latestTx.date,
        merchant,
      });
    }
  }

  // most recent first, cap
  return anomalies.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
