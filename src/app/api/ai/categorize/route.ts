import { NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";
import { aiEnabled, askClaude, extractJson } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORIES = [
  "Income",
  "Groceries",
  "Shopping",
  "Dining",
  "Transport",
  "Subscriptions",
  "Housing",
  "Utilities",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
];

/**
 * POST /api/ai/categorize — find merchants whose transactions are stuck in "Other"
 * (no override, no rule), ask Claude to categorize them, create AI-sourced rules.
 */
export async function POST() {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY to your environment (console.anthropic.com)." },
      { status: 400 }
    );
  }
  try {
    const db = getDb();
    const [rules, candidates] = await Promise.all([
      db.rule.findMany(),
      db.transaction.findMany({
        where: { category: "Other", categoryOverride: null, hidden: false },
        select: { merchant: true, amount: true },
      }),
    ]);

    // distinct merchants not already covered by a rule
    const covered = (m: string) => rules.some((r) => m.toLowerCase().includes(r.match.toLowerCase()));
    const byMerchant = new Map<string, { count: number; avg: number }>();
    for (const t of candidates) {
      if (covered(t.merchant)) continue;
      const e = byMerchant.get(t.merchant) ?? { count: 0, avg: 0 };
      e.avg = (e.avg * e.count + Math.abs(t.amount)) / (e.count + 1);
      e.count += 1;
      byMerchant.set(t.merchant, e);
    }
    const merchants = [...byMerchant.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 60)
      .map(([name, v]) => ({ name, count: v.count, typicalAmount: Math.round(v.avg) }));

    if (merchants.length === 0) {
      return NextResponse.json({ ok: true, created: 0, note: "Nothing uncategorized — all clean!" });
    }

    const text = await askClaude({
      system: `You categorize personal-finance merchants. Allowed categories: ${CATEGORIES.join(", ")}.
Respond with ONLY a JSON array: [{"merchant": "<exact name>", "category": "<category>", "cleanName": "<short friendly name or null>", "confident": true|false}].
Rules: use "Income" only for payroll/deposits. Transfers, payments to credit cards, and unclear items get "confident": false. cleanName only when the raw name is cryptic (e.g. "AMZN Mktp US*7Y2" -> "Amazon").`,
      messages: [{ role: "user", content: JSON.stringify(merchants) }],
      maxTokens: 4000,
    });

    const parsed = extractJson<{ merchant: string; category: string; cleanName?: string | null; confident: boolean }[]>(
      text
    );

    let created = 0;
    for (const p of parsed) {
      if (!p.confident) continue;
      if (!CATEGORIES.includes(p.category) || p.category === "Other") continue;
      if (!byMerchant.has(p.merchant)) continue; // model must echo an exact merchant we sent
      await db.rule.create({
        data: {
          match: p.merchant,
          setCategory: p.category,
          renameTo: p.cleanName || null,
          source: "ai",
        },
      });
      created++;
    }

    return NextResponse.json({ ok: true, created, examined: merchants.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "categorize failed" }, { status: 500 });
  }
}
