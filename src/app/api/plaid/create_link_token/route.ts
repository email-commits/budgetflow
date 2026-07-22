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
      // pull up to 24 months of history on link (default is only 90 days;
      // actual depth varies by institution)
      transactions: { days_requested: 730 },
      // holdings & performance for brokerage/retirement accounts when the bank supports it
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
      // Required for OAuth banks (Chase, BofA, etc.) in production.
      // Must exactly match an Allowed Redirect URI in the Plaid dashboard
      // (Developers -> API -> Allowed redirect URIs).
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link token error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
