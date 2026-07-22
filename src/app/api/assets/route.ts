import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";
import { recordSnapshot } from "@/lib/sync";

export const dynamic = "force-dynamic";

const KINDS = ["property", "vehicle", "cash", "other", "liability"];

/** POST /api/assets — create. Body: { name, kind, value } */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Manual assets require a database (set DATABASE_URL)." }, { status: 400 });
  }
  try {
    const { name, kind, value } = await req.json();
    if (!name || typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    if (typeof value !== "number" || !isFinite(value) || value < 0) {
      return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
    }
    const db = getDb();
    const asset = await db.manualAsset.create({ data: { name: name.trim(), kind, value } });
    await recordSnapshot(db);
    return NextResponse.json({ ok: true, asset });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 500 });
  }
}

/** PATCH /api/assets — update. Body: { id, name?, value? } */
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  try {
    const { id, name, value } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (value !== undefined) {
      if (typeof value !== "number" || !isFinite(value) || value < 0) {
        return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
      }
      data.value = value;
    }
    const db = getDb();
    await db.manualAsset.update({ where: { id }, data });
    await recordSnapshot(db);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "update failed" }, { status: 500 });
  }
}

/** DELETE /api/assets?id=... */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.manualAsset.delete({ where: { id } }).catch(() => {});
  await recordSnapshot(db);
  return NextResponse.json({ ok: true });
}
