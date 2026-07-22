import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient, plaidConfigured, readStore, writeStore } from "@/lib/plaid";
import { dbConfigured } from "@/lib/db";
import { registerItem, syncAll } from "@/lib/sync";

export async function POST(req: NextRequest) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid not configured" }, { status: 400 });
  }
  try {
    const { public_token } = await req.json();
    const client = getPlaidClient();
    const resp = await client.itemPublicTokenExchange({ public_token });

    // Preferred: persist to the database (works everywhere, supports multiple banks)
    if (dbConfigured()) {
      await registerItem(resp.data.access_token);
      await syncAll(true);
      return NextResponse.json({ ok: true, persisted: true, storage: "db" });
    }

    // Legacy: file store with env-var fallback
    const store = readStore();
    store.items.push({ accessToken: resp.data.access_token, itemId: resp.data.item_id });
    const persisted = writeStore(store);

    if (persisted) {
      return NextResponse.json({ ok: true, persisted: true });
    }
    // Read-only filesystem (deployed on Vercel): the token can't be saved server-side.
    // Return it once so the user can copy it into the PLAID_ACCESS_TOKEN env var.
    return NextResponse.json({
      ok: true,
      persisted: false,
      accessToken: resp.data.access_token,
      note: "Server storage is read-only. Copy accessToken into the PLAID_ACCESS_TOKEN environment variable and redeploy.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
