import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";

export async function POST() {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid keys not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env.local" },
      { status: 400 }
    );
  }
  try {
    const client = getPlaidClient();
    const resp = await client.linkTokenCreate({
      user: { client_user_id: "budgetflow-user" },
      client_name: "BudgetFlow",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link token error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
