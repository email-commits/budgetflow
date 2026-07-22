import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** PATCH /api/budgets — upsert a budget. Body: { category, monthlyLimit?, rollover? } */
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Budget editing requires a database (set DATABASE_URL)." }, { status: 400 });
  }
  try {
    const { category, monthlyLimit, rollover } = await req.json();
    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "category required" }, { status: 400 });
    }
    if (monthlyLimit !== undefined && (typeof monthlyLimit !== "number" || monthlyLimit < 0)) {
      return NextResponse.json({ error: "monthlyLimit must be a non-negative number" }, { status: 400 });
    }
    const db = getDb();
    const existing = await db.budget.findUnique({ where: { category } });
    const budget = await db.budget.upsert({
      where: { category },
      update: {
        ...(monthlyLimit !== undefined ? { monthlyLimit } : {}),
        ...(rollover !== undefined ? { rollover: Boolean(rollover) } : {}),
      },
      create: {
        category,
        monthlyLimit: monthlyLimit ?? existing?.monthlyLimit ?? 0,
        rollover: Boolean(rollover),
      },
    });
    return NextResponse.json({ ok: true, budget });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/budgets?category=... — remove a budget row. */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Budget editing requires a database." }, { status: 400 });
  }
  const category = req.nextUrl.searchParams.get("category");
  if (!category) return NextResponse.json({ error: "category required" }, { status: 400 });
  const db = getDb();
  await db.budget.delete({ where: { category } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
