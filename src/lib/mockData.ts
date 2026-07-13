import { Account, AppData, Budget, Category, Transaction } from "./types";

// ---- deterministic PRNG (mulberry32) so demo data is stable across reloads ----
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface MerchantDef {
  name: string;
  domain: string;
  category: Category;
  min: number;
  max: number;
  /** average purchases per 30 days */
  freq: number;
}

const MERCHANTS: MerchantDef[] = [
  { name: "Amazon", domain: "amazon.com", category: "Shopping", min: 12, max: 160, freq: 5 },
  { name: "Target", domain: "target.com", category: "Shopping", min: 18, max: 120, freq: 2.5 },
  { name: "Walmart", domain: "walmart.com", category: "Shopping", min: 15, max: 110, freq: 2 },
  { name: "Costco", domain: "costco.com", category: "Groceries", min: 60, max: 260, freq: 1.5 },
  { name: "Best Buy", domain: "bestbuy.com", category: "Shopping", min: 25, max: 400, freq: 0.4 },
  { name: "Apple", domain: "apple.com", category: "Shopping", min: 0.99, max: 240, freq: 0.6 },
  { name: "Home Depot", domain: "homedepot.com", category: "Shopping", min: 14, max: 180, freq: 0.8 },
  { name: "Kroger", domain: "kroger.com", category: "Groceries", min: 30, max: 140, freq: 4 },
  { name: "Trader Joe's", domain: "traderjoes.com", category: "Groceries", min: 22, max: 85, freq: 2.5 },
  { name: "Whole Foods Market", domain: "wholefoodsmarket.com", category: "Groceries", min: 25, max: 110, freq: 2 },
  { name: "Starbucks", domain: "starbucks.com", category: "Dining", min: 5, max: 16, freq: 8 },
  { name: "Chipotle", domain: "chipotle.com", category: "Dining", min: 11, max: 28, freq: 3 },
  { name: "McDonald's", domain: "mcdonalds.com", category: "Dining", min: 8, max: 22, freq: 2 },
  { name: "DoorDash", domain: "doordash.com", category: "Dining", min: 22, max: 65, freq: 3.5 },
  { name: "Chick-fil-A", domain: "chick-fil-a.com", category: "Dining", min: 9, max: 24, freq: 2 },
  { name: "Uber", domain: "uber.com", category: "Transport", min: 9, max: 42, freq: 3 },
  { name: "Lyft", domain: "lyft.com", category: "Transport", min: 8, max: 38, freq: 1.5 },
  { name: "Shell", domain: "shell.com", category: "Transport", min: 32, max: 68, freq: 3 },
  { name: "Chevron", domain: "chevron.com", category: "Transport", min: 30, max: 65, freq: 1.5 },
  { name: "CVS Pharmacy", domain: "cvs.com", category: "Health", min: 8, max: 60, freq: 1.5 },
  { name: "Walgreens", domain: "walgreens.com", category: "Health", min: 7, max: 45, freq: 1 },
  { name: "AMC Theatres", domain: "amctheatres.com", category: "Entertainment", min: 14, max: 48, freq: 0.7 },
  { name: "Steam", domain: "steampowered.com", category: "Entertainment", min: 5, max: 60, freq: 0.8 },
  { name: "Ticketmaster", domain: "ticketmaster.com", category: "Entertainment", min: 45, max: 220, freq: 0.25 },
  { name: "Delta Air Lines", domain: "delta.com", category: "Travel", min: 180, max: 520, freq: 0.15 },
  { name: "Airbnb", domain: "airbnb.com", category: "Travel", min: 220, max: 700, freq: 0.12 },
  { name: "Nike", domain: "nike.com", category: "Shopping", min: 40, max: 180, freq: 0.4 },
  { name: "Sephora", domain: "sephora.com", category: "Shopping", min: 25, max: 120, freq: 0.5 },
  { name: "Etsy", domain: "etsy.com", category: "Shopping", min: 12, max: 80, freq: 0.5 },
  { name: "REI", domain: "rei.com", category: "Shopping", min: 30, max: 250, freq: 0.25 },
];

interface RecurringDef {
  name: string;
  domain: string;
  category: Category;
  amount: number;
  dayOfMonth: number;
}

const RECURRING: RecurringDef[] = [
  { name: "Netflix", domain: "netflix.com", category: "Subscriptions", amount: 15.49, dayOfMonth: 3 },
  { name: "Spotify", domain: "spotify.com", category: "Subscriptions", amount: 11.99, dayOfMonth: 7 },
  { name: "iCloud", domain: "apple.com", category: "Subscriptions", amount: 2.99, dayOfMonth: 12 },
  { name: "YouTube Premium", domain: "youtube.com", category: "Subscriptions", amount: 13.99, dayOfMonth: 15 },
  { name: "Planet Fitness", domain: "planetfitness.com", category: "Health", amount: 24.99, dayOfMonth: 17 },
  { name: "Adobe Creative Cloud", domain: "adobe.com", category: "Subscriptions", amount: 59.99, dayOfMonth: 21 },
  { name: "OpenAI ChatGPT", domain: "openai.com", category: "Subscriptions", amount: 20.0, dayOfMonth: 9 },
  { name: "Sunrise Apartments Rent", domain: "", category: "Housing", amount: 1850, dayOfMonth: 1 },
  { name: "ComEd Electric", domain: "comed.com", category: "Utilities", amount: 96, dayOfMonth: 14 },
  { name: "Xfinity Internet", domain: "xfinity.com", category: "Utilities", amount: 79.99, dayOfMonth: 19 },
  { name: "AT&T Wireless", domain: "att.com", category: "Utilities", amount: 85.5, dayOfMonth: 23 },
  { name: "Geico Auto Insurance", domain: "geico.com", category: "Transport", amount: 142.3, dayOfMonth: 26 },
];

export const ACCOUNTS: Account[] = [
  { id: "acc_chk", name: "Everyday Checking", institution: "Chase", institutionDomain: "chase.com", type: "checking", mask: "4821", balance: 6412.37 },
  { id: "acc_sav", name: "High-Yield Savings", institution: "Ally Bank", institutionDomain: "ally.com", type: "savings", mask: "1177", balance: 21390.12 },
  { id: "acc_cc", name: "Sapphire Preferred", institution: "Chase", institutionDomain: "chase.com", type: "credit", mask: "7730", balance: -1843.55 },
  { id: "acc_inv", name: "Brokerage", institution: "Fidelity", institutionDomain: "fidelity.com", type: "investment", mask: "0093", balance: 48210.9 },
];

export const BUDGETS: Budget[] = [
  { category: "Groceries", monthlyLimit: 700 },
  { category: "Dining", monthlyLimit: 450 },
  { category: "Shopping", monthlyLimit: 600 },
  { category: "Transport", monthlyLimit: 400 },
  { category: "Subscriptions", monthlyLimit: 150 },
  { category: "Entertainment", monthlyLimit: 150 },
  { category: "Utilities", monthlyLimit: 300 },
  { category: "Health", monthlyLimit: 150 },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generateDemoData(today = new Date()): AppData {
  // fresh seeded PRNG per call so demo data is identical on every request
  const rand = mulberry32(20260713);
  const txs: Transaction[] = [];
  let id = 0;
  const start = new Date(today);
  start.setMonth(start.getMonth() - 6);
  start.setDate(1);

  // day-by-day walk
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const day = d.getDate();
    const dow = d.getDay();

    // paychecks on the 1st and 15th (weekday-adjusted not needed for demo)
    if (day === 1 || day === 15) {
      txs.push({
        id: `tx_${id++}`,
        accountId: "acc_chk",
        date: iso(d),
        merchant: "Acme Corp Payroll",
        merchantDomain: "",
        category: "Income",
        amount: 3120.55,
      });
    }
    // savings transfer on the 2nd
    if (day === 2) {
      txs.push({
        id: `tx_${id++}`,
        accountId: "acc_chk",
        date: iso(d),
        merchant: "Transfer to Savings",
        merchantDomain: "",
        category: "Other",
        amount: -800,
      });
    }

    // recurring bills
    for (const r of RECURRING) {
      if (day === r.dayOfMonth) {
        const jitter = r.amount > 90 && r.category === "Utilities" ? (rand() - 0.5) * 18 : 0;
        txs.push({
          id: `tx_${id++}`,
          accountId: r.amount > 500 ? "acc_chk" : "acc_cc",
          date: iso(d),
          merchant: r.name,
          merchantDomain: r.domain || undefined,
          category: r.category,
          amount: -Math.round((r.amount + jitter) * 100) / 100,
        });
      }
    }

    // everyday merchants — probability per day from freq/30, weekend boost for dining/shopping
    for (const m of MERCHANTS) {
      let p = m.freq / 30;
      if ((dow === 0 || dow === 6) && (m.category === "Dining" || m.category === "Shopping" || m.category === "Entertainment")) {
        p *= 1.8;
      }
      if (rand() < p) {
        const amt = m.min + rand() * (m.max - m.min);
        txs.push({
          id: `tx_${id++}`,
          accountId: rand() < 0.75 ? "acc_cc" : "acc_chk",
          date: iso(d),
          merchant: m.name,
          merchantDomain: m.domain,
          category: m.category,
          amount: -Math.round(amt * 100) / 100,
        });
      }
    }
  }

  // a couple of pending transactions on the most recent days
  const recent = txs.slice(-4);
  for (const t of recent) if (t.amount < 0) t.pending = rand() < 0.5;

  txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { mode: "demo", accounts: ACCOUNTS, transactions: txs, budgets: BUDGETS };
}
