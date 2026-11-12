import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";
import { aiEnabled, askClaude, extractJson } from "@/lib/ai";
import {
  buildReviewPrompt,
  collectMerchants,
  parseReview,
  REVIEW_BATCH,
  ReviewScope,
  reviewChoices,
} from "@/lib/aiReview";
import { loadCategories } from "@/lib/categoryStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/categorize — let Claude file merchants into categories, saved as AI rules.
 *
 *   ?scope=uncategorized (default)  only merchants stuck in Uncategorized / Miscellaneous
 *   ?scope=all&offset=N             re-review EVERY merchant against the current category
 *                                   list, one batch per call. Start at offset 0 (which
 *                                   clears the previous AI rules) and keep calling with
 *                                   the returned nextOffset until done is true.
 *
 * Your own edits and your own rules always win and are never touched: merchants
 * one of your rules already matches are skipped, and per-transaction edits
 * override any rule.
 */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY to your environment (console.anthropic.com)." },
      { status: 400 }
    );
  }
  const scope: ReviewScope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "uncategorized";
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);

  try {
    const db = getDb();
    const categories = await loadCategories(db);

    // a full re-review starts from a clean slate of AI rules
    if (scope === "all" && offset === 0) {
      await db.rule.deleteMany({ where: { source: "ai" } });
    }

    const [rules, txs] = await Promise.all([
      db.rule.findMany(),
      db.transaction.findMany({
        where: { categoryOverride: null, hidden: false },
        select: { merchant: true, amount: true, category: true },
      }),
    ]);
    // "all": only YOUR rules take a merchant off the list, so the list (and
    // therefore the offsets) stays the same while this run adds AI rules.
    const skip = scope === "all" ? rules.filter((r) => r.source !== "ai") : rules;
    const merchants = collectMerchants(txs, skip, scope);
    const total = merchants.length;
    const batch = merchants.slice(offset, offset + REVIEW_BATCH);

    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        created: 0,
        examined: 0,
        total,
        nextOffset: offset,
        done: true,
        note: total === 0 ? "Nothing to review — all clean!" : undefined,
      });
    }

    const choices = reviewChoices(categories);
    const { system, user } = buildReviewPrompt(choices, batch);
    const text = await askClaude({ system, messages: [{ role: "user", content: user }], maxTokens: 3000 });
    const assignments = parseReview(extractJson<unknown>(text), choices, batch);

    const existingAi = new Set(rules.filter((r) => r.source === "ai").map((r) => r.match));
    const data = assignments
      .filter((a) => !existingAi.has(a.merchant))
      .map((a) => ({ match: a.merchant, setCategory: a.category, renameTo: a.cleanName ?? null, source: "ai" }));
    if (data.length > 0) await db.rule.createMany({ data });

    const nextOffset = offset + batch.length;
    // "uncategorized" is a single pass over the most frequent unknown merchants
    const done = scope === "uncategorized" || nextOffset >= total;
    return NextResponse.json({ ok: true, created: data.length, examined: batch.length, total, nextOffset, done });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "categorize failed" }, { status: 500 });
  }
}
