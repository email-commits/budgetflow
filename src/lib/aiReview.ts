import { CategoryDef, normalizeCategory, UNCATEGORIZED } from "./categories";

/**
 * AI review of merchants: pure helpers (no network, no database) so the logic
 * can be unit-tested. The route in app/api/ai/categorize wires these to Claude
 * and to the Rule table.
 *
 * The model sees merchants and categories as numbered lists and answers with
 * index pairs, which keeps replies short (fast, cheap) and makes it impossible
 * for it to invent a merchant or category name.
 */

export type ReviewScope = "all" | "uncategorized";

export interface MerchantStat {
  /** merchant name exactly as stored (what a rule will match on) */
  name: string;
  count: number;
  /** average signed amount: negative = money out */
  avg: number;
  /** the category it has now, before any rule (most common across its transactions) */
  current: string;
}

export const REVIEW_BATCH = 80;
export const REVIEW_MAX_MERCHANTS = 1600;
const STUCK = new Set([UNCATEGORIZED, "Miscellaneous"]);

/** Distinct merchants worth reviewing, most frequent first (stable order across batches). */
export function collectMerchants(
  txs: { merchant: string; amount: number; category: string }[],
  skipRules: { match: string }[],
  scope: ReviewScope
): MerchantStat[] {
  const matches = skipRules.map((r) => r.match.toLowerCase()).filter(Boolean);
  const byName = new Map<string, { count: number; sum: number; cats: Map<string, number> }>();
  for (const t of txs) {
    const name = t.merchant;
    if (name.trim().length < 3) continue; // too short to match safely
    let e = byName.get(name);
    if (!e) byName.set(name, (e = { count: 0, sum: 0, cats: new Map() }));
    e.count += 1;
    e.sum += t.amount;
    const c = normalizeCategory(t.category);
    e.cats.set(c, (e.cats.get(c) ?? 0) + 1);
  }
  const out: MerchantStat[] = [];
  for (const [name, e] of byName) {
    const lower = name.toLowerCase();
    if (matches.some((m) => lower.includes(m))) continue; // one of your own rules already decides this
    const current = [...e.cats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    if (scope === "uncategorized" && !STUCK.has(current)) continue;
    out.push({ name, count: e.count, avg: Math.round((e.sum / e.count) * 100) / 100, current });
  }
  return out
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, REVIEW_MAX_MERCHANTS);
}

/** Categories the model may choose from (hidden ones and the catch-all are not offered). */
export function reviewChoices(categories: CategoryDef[]): CategoryDef[] {
  return categories.filter((c) => !c.hidden && c.name !== UNCATEGORIZED);
}

export function buildReviewPrompt(choices: CategoryDef[], batch: MerchantStat[]): { system: string; user: string } {
  const catLines = choices.map((c, i) => `${i}|${c.name}|${c.group}|${c.kind}`).join("\n");
  const merchantLines = batch
    .map((m, i) => `${i}|${m.name}|${m.count}|${m.avg.toFixed(2)}|${m.current}`)
    .join("\n");
  const system = `You file a household's bank and card merchants into budget categories.

CATEGORIES (index|name|group|kind):
${catLines}

For each merchant pick the single best category index, or -1 if you cannot tell from the name.
Guidance:
- avg is the average signed amount: negative is money out, positive is money in. Only use "income" categories for money in.
- "transfer" categories are for money moving between the person's own accounts. Paying a credit card bill is a transfer (Credit Card Payment), not spending.
- Loan payments are spending: car loans, student loans, mortgage and other loans each have their own category.
- "current" is the bank's guess. Keep it when it is reasonable; change it only when another category is clearly a better fit.
- Prefer a specific category over Miscellaneous. Use -1 rather than guessing.

Reply with ONLY a JSON array of [merchantIndex, categoryIndex] pairs, one per merchant, e.g. [[0,12],[1,-1]].
If a merchant name is cryptic bank shorthand, you may add a short clean name as a third item: [2,7,"Amazon"]. Otherwise omit it.`;
  return { system, user: `MERCHANTS (index|name|transactions|avg|current):\n${merchantLines}` };
}

export interface ReviewAssignment {
  merchant: string;
  category: string;
  cleanName?: string;
}

/**
 * Turn the model's reply into rule-worthy assignments. Drops anything out of
 * range, unsure (-1), or that only repeats what the bank already said.
 */
export function parseReview(reply: unknown, choices: CategoryDef[], batch: MerchantStat[]): ReviewAssignment[] {
  if (!Array.isArray(reply)) return [];
  const seen = new Set<number>();
  const out: ReviewAssignment[] = [];
  for (const row of reply) {
    if (!Array.isArray(row)) continue;
    const [mi, ci, clean] = row as [unknown, unknown, unknown];
    if (!Number.isInteger(mi) || !Number.isInteger(ci)) continue;
    const m = batch[mi as number];
    const c = choices[ci as number];
    if (!m || !c || seen.has(mi as number)) continue;
    seen.add(mi as number);
    // money going out is never income
    if (c.kind === "income" && m.avg < 0) continue;
    const cleanName =
      typeof clean === "string" && clean.trim().length >= 2 && clean.trim().length <= 60 && clean.trim() !== m.name
        ? clean.trim()
        : undefined;
    if (c.name === m.current && !cleanName) continue; // nothing to change
    out.push({ merchant: m.name, category: c.name, cleanName });
  }
  return out;
}
