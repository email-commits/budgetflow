import { NextRequest, NextResponse } from "next/server";
import { getAppData } from "@/lib/data";
import { aiEnabled, askClaude, ChatMessage } from "@/lib/ai";
import { totalNetWorth } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/ask — natural-language questions about the user's finances.
 * Body: { question: string, history?: {role, content}[] }
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY to your environment (console.anthropic.com)." },
      { status: 400 }
    );
  }
  try {
    const { question, history = [] } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    const data = await getAppData();

    // compact context: ~4 months of visible transactions, capped
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const txLines = data.transactions
      .filter((t) => !t.hidden && t.date >= cutoffIso)
      .slice(0, 1500)
      .map((t) => `${t.date}|${t.merchant}|${t.category}|${t.amount.toFixed(2)}`)
      .join("\n");

    const accountLines = data.accounts
      .map((a) => `${a.name} (${a.institution}, ${a.type}): ${a.balance.toFixed(2)}`)
      .join("\n");
    const budgetLines = (data.budgets ?? []).map((b) => `${b.category}: ${b.monthlyLimit}/mo`).join("\n");
    const goalLines = (data.goals ?? [])
      .map((g) => `${g.name} (${g.kind}, target ${g.targetAmount}${g.targetDate ? `, by ${g.targetDate}` : ""})`)
      .join("\n");

    const today = new Date().toISOString().slice(0, 10);
    const system = `You are BudgetFlow's financial assistant. Answer questions about the user's own finances using ONLY the data below. Be concise and specific — lead with the number, then 1-2 sentences of context. Use $X,XXX formatting. If the data can't answer the question, say so plainly. Today is ${today}. Amounts: negative = money out, positive = money in.

NET WORTH: ${totalNetWorth(data).toFixed(2)}

ACCOUNTS:
${accountLines}

BUDGETS:
${budgetLines || "none"}

GOALS:
${goalLines || "none"}

TRANSACTIONS (last 120 days, date|merchant|category|amount):
${txLines}`;

    const messages: ChatMessage[] = [
      ...history.slice(-8).map((m: ChatMessage) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question },
    ];

    const answer = await askClaude({ system, messages, maxTokens: 800 });
    return NextResponse.json({ ok: true, answer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ask failed" }, { status: 500 });
  }
}
