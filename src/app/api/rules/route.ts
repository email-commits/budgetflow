import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/rules — list rules. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ rules: [] });
  const db = getDb();
  const rules = await db.rule.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ rules });
}

/** POST /api/rules — create a rule. Body: { match, setCategory?, renameTo? } */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Rules require a database (set DATABASE_URL)." }, { status: 400 });
  }
  try {
    const { match, setCategory, renameTo } = await req.json();
    if (!match || typeof match !== "string" || match.trim().length < 2) {
      return NextResponse.json({ error: "Match text must be at least 2 characters." }, { status: 400 });
    }
    if (!setCategory && !renameTo) {
      return NextResponse.json({ error: "A rule needs a category and/or a rename." }, { status: 400 });
    }
    const db = getDb();
    const rule = await db.rule.create({
      data: { match: match.trim(), setCategory: setCategory ?? null, renameTo: renameTo?.trim() || null },
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/rules?id=... — delete a rule. */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Rules require a database." }, { status: 400 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.rule.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
