import { NextRequest, NextResponse } from "next/server";
import { CountryCode, LinkTokenCreateRequest, Products } from "plaid";
import { formatPlaidError, getPlaidClient, plaidConfigured } from "@/lib/plaid";
import { isLinkTarget, LinkTarget, resolveBrokerInstitution, ResolvedInstitution } from "@/lib/institutions";

export const dynamic = "force-dynamic";

function baseRequest(): LinkTokenCreateRequest {
  return {
    user: { client_user_id: "budgetflow-user" },
    client_name: "BudgetFlow",
    country_codes: [CountryCode.Us],
    language: "en",
    ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
  };
}

function targetingFields(inst: ResolvedInstitution): Partial<LinkTokenCreateRequest> {
  return {
    // Legacy / payment-style preselect — still accepted by /link/token/create.
    institution_id: inst.institution_id,
    // Current US Institution Select shortcut (official Link customization docs).
    ...(inst.routing_numbers[0]
      ? { institution_data: { routing_number: inst.routing_numbers[0] } }
      : {}),
  };
}

async function createToken(body: LinkTokenCreateRequest) {
  return getPlaidClient().linkTokenCreate(body);
}

export async function POST(req: NextRequest) {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid keys not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env.local" },
      { status: 400 }
    );
  }

  let target: LinkTarget = "bank";
  try {
    const json = await req.json();
    if (isLinkTarget(json?.target)) target = json.target;
  } catch {
    /* empty body — generic bank Link */
  }

  try {
    let resolved: ResolvedInstitution | null = null;
    if (target !== "bank") {
      try {
        resolved = await resolveBrokerInstitution(target);
      } catch (e) {
        console.warn("Institution search failed, using generic Link:", formatPlaidError(e, "search error"));
      }
    }

    // Brokerage buttons initialize Investments (required for holdings) plus Transactions.
    // Bank button keeps Transactions required and consents to Investments when supported
    // so existing bank linking is not filtered to investment-capable institutions.
    // See https://plaid.com/docs/link/initializing-products/ and /docs/investments/
    const products: Products[] = target !== "bank"
      ? [Products.Investments, Products.Transactions]
      : [Products.Transactions];

    const request: LinkTokenCreateRequest = {
      ...baseRequest(),
      products,
      ...(target !== "bank"
        ? {}
        : { additional_consented_products: [Products.Investments] }),
      transactions: { days_requested: 730 },
      ...(resolved ? targetingFields(resolved) : {}),
    };

    try {
      const resp = await createToken(request);
      return NextResponse.json({
        link_token: resp.data.link_token,
        target,
        targeted: resolved
          ? { institution_id: resolved.institution_id, name: resolved.name }
          : null,
        fallback: !resolved && target !== "bank",
      });
    } catch (first) {
      // Drop institution targeting if Plaid rejects institution_id / routing_number.
      if (resolved) {
        try {
          const untargeted: LinkTokenCreateRequest = { ...request };
          delete untargeted.institution_id;
          delete untargeted.institution_data;
          const resp = await createToken(untargeted);
          return NextResponse.json({
            link_token: resp.data.link_token,
            target,
            targeted: null,
            fallback: true,
            note: "Institution-targeted Link was not available; opened generic search.",
          });
        } catch {
          /* fall through to product fallback */
        }
      }

      // Investments not enabled on this Plaid account — keep bank linking working.
      if (target !== "bank") {
        const fallbackReq: LinkTokenCreateRequest = {
          ...baseRequest(),
          products: [Products.Transactions],
          additional_consented_products: [Products.Investments],
          optional_products: undefined,
          transactions: { days_requested: 730 },
        };
        const resp = await createToken(fallbackReq);
        return NextResponse.json({
          link_token: resp.data.link_token,
          target,
          targeted: null,
          fallback: true,
          note:
            "Investments is not enabled on this Plaid account yet. Link will still open; enable the Investments product in the Plaid Dashboard to pull holdings.",
        });
      }

      throw first;
    }
  } catch (e) {
    const msg = formatPlaidError(e, "link token error");
    console.error("create_link_token failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
