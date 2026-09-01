# BudgetFlow

A Copilot / Monarch-style personal budgeting app built with Next.js 14, Tailwind CSS, Recharts, and Plaid.

## Features

- **Dashboard** — net worth hero + history chart, invested / cash totals, institution breakdown (Fidelity vs T. Rowe vs Schwab vs banks), account list with type and logos, spending-by-category donut, this-month income/spend/net, recent transactions
- **Investments** — live holdings (ticker, quantity, value, allocation %), asset mix from Plaid security types, empty state until a brokerage is linked (demo never invents holdings)
- **Transactions** — searchable, category-filterable feed grouped by day, with retailer logos
- **Budgets** — monthly category budgets with progress bars, pace marker, and over-budget warnings
- **Recurring** — automatic detection of subscriptions & bills (Netflix, rent, utilities…) with next-charge dates and an upcoming strip
- **Cash Flow** — income vs. spending by month, savings rate, monthly table
- **Merchant logos** — three-tier fallback: Plaid enrichment logo → Clearbit logo lookup by domain → colored initial avatar

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the app boots in **demo mode** with six months of realistic generated data, so every screen works with zero setup.

## Connecting Plaid (sandbox)

1. Create a free account at https://dashboard.plaid.com and copy your `client_id` and **sandbox** secret (Team Settings → Keys). Enable the **Transactions** and **Investments** products.
2. Copy `.env.example` to `.env.local` and fill in the keys:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   ```
3. Restart `npm run dev`, go to **Settings**.
4. Connect a brokerage with **Connect Fidelity**, **Connect T. Rowe Price**, or **Connect Charles Schwab**, or use **Connect a bank** for checking/savings/credit.
5. In the sandbox Link flow, sign in with the credentials Plaid publishes for Sandbox (see [Sandbox docs](https://plaid.com/docs/sandbox/) — typically `user_good` / `pass_good`). Do not invent institution IDs or extra passwords.

Brokerage buttons resolve the current Plaid `institution_id` at runtime via [`/institutions/search`](https://plaid.com/docs/api/institutions/#institutionssearch) (IDs change with OAuth migrations and multiple login portals, so they are not hardcoded). When Plaid allows it, Link is opened with that `institution_id` plus the [Institution Select shortcut](https://plaid.com/docs/link/customization/#institution-select-shortcut) (`institution_data.routing_number` from the search result). If targeting fails, Link falls back to the generic institution search.

### Products: Transactions vs Investments

Bank linking initializes **Transactions** (and consents to Investments when the institution supports it). Brokerage buttons initialize **Investments + Transactions**.

**Transactions alone is not enough for holdings.** Per [Plaid Investments](https://plaid.com/docs/investments/), create the Link token with `investments` in `products` (or `required_if_supported_products` / `optional_products` / `additional_consented_products`), then call [`/investments/holdings/get`](https://plaid.com/docs/api/products/investments/#investmentsholdingsget) for securities and positions. This app does that after each sync.

Once an Item is linked, `/api/data` switches from demo data to live Plaid data. Demo mode never injects sample holdings into the Investments page.

Multiple Item access tokens are stored in `.plaid-store.json` (local) or in Postgres when `DATABASE_URL` is set. Nothing secret is committed. On Vercel without a database, only `PLAID_ACCESS_TOKEN` (one Item) persists — use Neon for several banks/brokerages.

### Sandbox vs production

| | Sandbox | Production |
|---|---|---|
| Env | `PLAID_ENV=sandbox` | `PLAID_ENV=production` |
| Keys | Sandbox secret | Production secret + approved Production access |
| Investments | Works without extra permissions. For [custom Sandbox users](https://plaid.com/docs/investments/#testing-investments), `investments` must be in the `products` array (not only optional). | Enable Investments in the Dashboard. |
| Fidelity | Searchable in Sandbox Link | [Automatic on Growth/Custom](https://plaid.com/docs/investments/#investments-institution-coverage) ~8 weeks after Production is granted. Pay-as-you-go must request access via a Dashboard support ticket. |
| Charles Schwab | Sandbox OAuth institutions work | [Up to six weeks](https://plaid.com/docs/link/oauth/) after Production; Pay-as-you-go must request Schwab on the OAuth institutions page. One active Schwab OAuth Item per user per app. |
| OAuth redirect | Optional | Required: set `PLAID_REDIRECT_URI` to `/settings` and register it under Allowed redirect URIs. |

Plaid does not publish a static public list of production institution IDs. This app looks them up with `/institutions/search` using the official names “Fidelity Investments”, “T. Rowe Price”, and “Charles Schwab”.

### Workplace 401(k) coverage (T. Rowe and others)

Plaid treats each login portal as its own institution ([`institution_id` notes](https://plaid.com/docs/api/institutions/)). A workplace 401(k) invested in T. Rowe Price funds is often recordkept by a **plan administrator** (Alight, Empower, Fidelity NetBenefits, etc.). In that case Link will not list “T. Rowe Price” as the login — search for the name on the plan’s website or use **Connect a bank** and type the administrator. Coverage varies by plan even when T. Rowe is the asset manager.

To move from Sandbox to real accounts, switch `PLAID_ENV` to `production` with the matching secret after Dashboard approval.

## Deploying to Vercel (free) + weekly email digest

1. Push the project to a GitHub repo, then import it at https://vercel.com/new (defaults are fine).
2. In Vercel → Project → Settings → Environment Variables, add:
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
   - `PLAID_ACCESS_TOKEN` — Vercel has no persistent disk, so link your bank locally first, then copy the `accessToken` value out of `.plaid-store.json`
   - `RESEND_API_KEY` — free key from https://resend.com/api-keys (or use `GMAIL_USER` + `GMAIL_APP_PASSWORD` for Gmail SMTP instead)
   - `DIGEST_TO` — recipient address (required with Resend)
   - `APP_PASSWORD` — password gate for the app (recommended: your finances are on a public URL)
   - `CRON_SECRET` — any random string; protects the digest endpoint
3. Deploy. `vercel.json` schedules **`/api/digest` every Sunday at 14:00 UTC** (~9am Central); Vercel Cron calls it with the `CRON_SECRET` automatically.
4. Test without waiting for Sunday: open `https://your-app.vercel.app/api/digest?preview=1` (renders the email in the browser), or trigger a real send from Vercel's Cron tab.

The digest includes: total spend vs. last week, income, net worth, category breakdown, five biggest purchases, and recurring charges due in the next 7 days.

## Database (Phase 0)

With `DATABASE_URL` set (free Postgres from https://neon.tech), the app upgrades to:

- **Persistent storage** — tokens, accounts, and transactions live in the DB (no more env-var token juggling on Vercel; linking a bank on the deployed site just works)
- **Multiple banks** — link as many institutions as you want
- **Fast incremental sync** — cursor-based `transactions/sync`; pages load from the DB instantly, Plaid is only consulted every 15 min (or via Settings → "Sync now")
- **DB-backed budgets** — seeded with defaults, ready for in-app editing (Phase 1)

Setup: create a Neon project → copy the connection string → add `DATABASE_URL` to `.env.local` and Vercel → run `npm run db:push` once locally (creates tables) → restart. Existing tokens in `.plaid-store.json` / `PLAID_ACCESS_TOKEN` are imported automatically on first run.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark, Copilot-inspired theme)
- Recharts for charts
- Plaid Node SDK (`transactions/sync`, `/investments/holdings/get`, `/institutions/search`)
