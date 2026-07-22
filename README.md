# BudgetFlow

A Copilot / Monarch-style personal budgeting app built with Next.js 14, Tailwind CSS, Recharts, and Plaid.

## Features

- **Dashboard** — net worth hero + history chart, account list with institution logos, spending-by-category donut, this-month income/spend/net, recent transactions
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

1. Create a free account at https://dashboard.plaid.com and copy your `client_id` and **sandbox** secret (Team Settings → Keys).
2. Copy `.env.example` to `.env.local` and fill in the keys:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   ```
3. Restart `npm run dev`, go to **Settings**, and click **Connect a bank with Plaid**.
4. In the sandbox Link flow, choose any bank and sign in with `user_good` / `pass_good`.

Once an account is linked, `/api/data` switches from demo data to live Plaid data (accounts + transactions with enriched merchant names, categories, and logos). To move to real banks later, switch `PLAID_ENV` to `development`/`production` with the matching secret.

Linked access tokens are stored in `.plaid-store.json` (dev-only convenience — swap for a real database before deploying anything).

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
- Plaid Node SDK (`transactions/sync` + enrichment fields)
