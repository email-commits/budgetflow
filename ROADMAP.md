# BudgetFlow Roadmap — closing the gap with Copilot & Monarch

*Compiled July 2026 from current Copilot Money and Monarch Money feature sets.*

## Where BudgetFlow already competes

Dashboard with net worth + accounts, transaction feed with merchant logos, category budgets
with pace markers, recurring/subscription detection, cash-flow reports, Plaid production
bank linking, weekly email digest, password-gated deployment.

## Gap analysis

| Feature | Copilot | Monarch | BudgetFlow today |
|---|---|---|---|
| Edit/recategorize transactions | ✅ | ✅ | ❌ read-only |
| Custom categories & rules engine | ✅ ML (~93%) | ✅ user rules | ❌ fixed mapping |
| Budget editing in-app + rollover | ✅ | ✅ | ❌ hardcoded limits |
| Investment holdings & performance | ✅ | ✅ | ❌ balance only |
| Savings/debt goals | ➖ light | ✅ core feature | ❌ |
| Real net-worth history | ✅ | ✅ (incl. real estate) | ➖ estimated from cash flow |
| Manual accounts/assets (home, car, cash) | ➖ | ✅ | ❌ |
| Monthly review / recaps | ✅ signature feature | ✅ weekly emails | ➖ weekly email only |
| AI assistant (ask questions about spending) | ➖ | ✅ | ❌ |
| Household / multi-user | ❌ | ✅ unlimited members | ❌ single password |
| Mobile apps / widgets | ✅ Apple-native | ✅ iOS+Android | ➖ responsive web |
| Notifications (large charge, bill due) | ✅ | ✅ | ❌ |

## Build plan

### Phase 0 — Database foundation *(prerequisite for everything below)*
Add a real database (Neon/Vercel Postgres — free tier) with Prisma.
Store: linked banks (multi-bank!), synced transactions with cursor-based
incremental sync, user edits, budgets, goals, net-worth snapshots.
This also fixes today's limits: env-var token, full re-sync every request,
no persistence on Vercel.
**Effort: 1 session. Unlocks: everything.**

### Phase 1 — Transaction control (the Monarch "rules" experience)
Recategorize / rename / hide transactions in the UI; changes persist.
Custom categories with icons/colors. Rules engine: "merchant contains X →
category Y, rename to Z" applied automatically to new transactions.
Editable budgets in-app with optional monthly rollover.
**Effort: 1–2 sessions. Highest daily-use payoff.**

### Phase 2 — Wealth tracking
Plaid Investments product: holdings, cost basis, gain/loss, allocation chart.
Manual assets & liabilities (home value, vehicles, cash) for true net worth.
Nightly net-worth snapshot (cron) → real history chart by asset class.
**Effort: 1–2 sessions.**

### Phase 3 — Goals & monthly review
Goals with target amount/date, linked accounts, progress projection
(Monarch-style). A Copilot-style "Monthly Review" page: month grade,
top categories vs. average, biggest merchants, savings rate — plus a
monthly email edition of the digest.
**Effort: 1 session.**

### Phase 4 — Intelligence
Smart categorization: rules first, then a Claude API call for unknown
merchants (approaching Copilot's ML accuracy). "Ask your money" chat:
natural-language questions answered from your transaction DB
("how much did I spend on dining vs. last month?").
Anomaly alerts: unusually large charge, duplicate charge, price hike on
a subscription → email/push notification.
**Effort: 2 sessions. Needs an Anthropic API key (~pennies/month at this scale).**

### Phase 5 — Household & mobile polish
Real auth (NextAuth: email magic links) replacing the single password;
invite a partner, per-member transaction tagging, shared vs. personal views.
PWA manifest + service worker → installable on phone with app icon.
**Effort: 2 sessions.**

## Suggested order

Phase 0 → 1 are the no-brainers (foundation + daily usability).
Then pick by appetite: 2 if net worth is what you check most, 3 if goals
motivate you, 4 for the wow factor.

## Also on the list (from earlier)
- Finish Vercel production cutover (2 secrets + redeploy)
- Debug Sunday email delivery (check Resend signup address / spam)
