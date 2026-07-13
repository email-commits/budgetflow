import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient, plaidConfigured, readStore, writeStore } from "@/lib/plaid";

export async function POST(req: NextRequest) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid not configured" }, { status: 400 });
  }
  try {
    const { public_token } = await req.json();
    const client = getPlaidClient();
    const resp = await client.itemPublicTokenExchange({ public_token });
    const store = readStore();
    store.items.push({ accessToken: resp.data.access_token, itemId: resp.data.item_id });
    writeStore(store);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
