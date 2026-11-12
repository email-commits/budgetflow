import assert from "node:assert/strict";
import test from "node:test";
import { monthlyCashFlow, spendByCategory } from "./analytics";
import { buildReviewPrompt, collectMerchants, parseReview, reviewChoices } from "./aiReview";
import {
  DEFAULT_CATEGORIES,
  LEGACY_ALIASES,
  cleanCategoryName,
  groupCategories,
  isExcludedCategory,
  normalizeCategory,
  registerCategories,
} from "./categories";
import { mapPlaidCategory } from "./plaid";
import { isTransfer, Transaction } from "./types";

const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name));

test("default list is well formed", () => {
  assert.equal(names.size, DEFAULT_CATEGORIES.length, "names are unique");
  assert.ok(DEFAULT_CATEGORIES.length >= 45);
  for (const c of DEFAULT_CATEGORIES) assert.match(c.color, /^#[0-9a-f]{6}$/);
  // transfers and the catch-all group sort after everything else
  const groups = groupCategories(DEFAULT_CATEGORIES).map((g) => g.group);
  assert.deepEqual(groups.slice(-2), ["Transfers", "Other"]);
  assert.equal(groups[0], "Income");
});

test("every legacy name and every Plaid mapping lands on a real category", () => {
  for (const [from, to] of Object.entries(LEGACY_ALIASES)) assert.ok(names.has(to), `${from} -> ${to}`);
  const samples: [string, string][] = [
    ["INCOME", "INCOME_WAGES"], ["INCOME", "INCOME_DIVIDENDS"], ["TRANSFER_IN", "TRANSFER_IN_DEPOSIT"],
    ["TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"], ["TRANSFER_OUT", "TRANSFER_OUT_WITHDRAWAL"],
    ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"], ["BANK_FEES", "BANK_FEES_ATM_FEES"],
    ["ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"], ["FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"],
    ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES"], ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_HARDWARE"],
    ["MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS"], ["PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY"],
    ["GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"], ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT"],
    ["TRANSPORTATION", "TRANSPORTATION_GAS"], ["TRAVEL", "TRAVEL_FLIGHTS"], ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"],
    ["BRAND_NEW_PRIMARY", "X"],
  ];
  for (const [p, d] of samples) assert.ok(names.has(mapPlaidCategory(p, d)), `${p}/${d}`);
});

test("Plaid detail picks the specific category", () => {
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"), "Auto Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT"), "Student Loans");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"), "Mortgage");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT"), "Loan Repayment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"), "Credit Card Payment");
  assert.equal(mapPlaidCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), "Groceries");
  assert.equal(mapPlaidCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"), "Coffee Shops");
  assert.equal(mapPlaidCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"), "Restaurants & Bars");
  assert.equal(mapPlaidCategory("TRANSPORTATION", "TRANSPORTATION_GAS"), "Gas");
  assert.equal(mapPlaidCategory("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE"), "Phone");
  assert.equal(mapPlaidCategory("GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE"), "Insurance");
  assert.equal(mapPlaidCategory("INCOME", "INCOME_WAGES"), "Paychecks");
  // person-to-person transfers are NOT silently dropped from spending
  assert.equal(mapPlaidCategory("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"), "Uncategorized");
  assert.equal(mapPlaidCategory("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"), "Transfer");
  assert.equal(mapPlaidCategory(undefined, undefined), "Uncategorized");
});

test("normalize maps legacy and unknown names", () => {
  registerCategories(DEFAULT_CATEGORIES);
  assert.equal(normalizeCategory("Dining"), "Restaurants & Bars");
  assert.equal(normalizeCategory("Debt Payment"), "Loan Repayment");
  assert.equal(normalizeCategory("Groceries"), "Groceries");
  assert.equal(normalizeCategory("Other"), "Uncategorized");
  assert.equal(normalizeCategory("A Deleted Custom One"), "Uncategorized");
  assert.equal(normalizeCategory(null), "Uncategorized");
  assert.equal(cleanCategoryName("  Lake   Cabin "), "Lake Cabin");
  assert.equal(cleanCategoryName("x"), null);
  assert.equal(cleanCategoryName(5), null);
});

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), accountId: "a", date: "2026-10-10", merchant: "m", category: "Uncategorized", amount: -1, ...o,
});

test("transfers and excluded custom categories stay out of spending and income", () => {
  registerCategories([
    ...DEFAULT_CATEGORIES,
    { name: "Work Reimbursable", group: "Other", color: "#000000", kind: "expense", excluded: true, hidden: false, custom: true, sortOrder: 99999 },
  ]);
  const txs = [
    tx({ category: "Restaurants & Bars", amount: -50 }),
    tx({ category: "Auto Payment", merchant: "Auto Loan", amount: -400 }),
    tx({ category: "Credit Card Payment", merchant: "Chase Card Payment", amount: -1500 }),
    tx({ category: "Credit Card Payment", merchant: "Payment Thank You", amount: 1500 }),
    tx({ category: "Work Reimbursable", merchant: "Hotel", amount: -300 }),
    tx({ category: "Paychecks", merchant: "Payroll", amount: 3000 }),
  ];
  const byCat = Object.fromEntries(spendByCategory(txs, "2026-10").map((c) => [c.category, c.total]));
  assert.deepEqual(byCat, { "Auto Payment": 400, "Restaurants & Bars": 50 });
  assert.deepEqual(monthlyCashFlow(txs), [{ month: "2026-10", income: 3000, spend: 450, net: 2550 }]);
  assert.equal(isExcludedCategory("Transfer"), true);
  assert.equal(isExcludedCategory("Work Reimbursable"), true);
  assert.equal(isExcludedCategory("Groceries"), false);
  assert.equal(isTransfer({ category: "Uncategorized", merchant: "Online Transfer to SAV" }), true);
  assert.equal(isTransfer({ category: "Loan Repayment", merchant: "Loan transfer" }), false);
  registerCategories(DEFAULT_CATEGORIES);
});

test("AI review: merchant list, prompt and reply parsing", () => {
  registerCategories(DEFAULT_CATEGORIES);
  const txs = [
    ...Array.from({ length: 5 }, () => ({ merchant: "SQ *BLUE BOTTLE", amount: -6, category: "Restaurants & Bars" })),
    ...Array.from({ length: 3 }, () => ({ merchant: "ACME PAYROLL", amount: 2500, category: "Other Income" })),
    { merchant: "MYSTERY LLC", amount: -40, category: "Other" }, // legacy name -> Uncategorized
    { merchant: "Costco", amount: -200, category: "Shopping" },
    { merchant: "AB", amount: -1, category: "Shopping" }, // too short
  ];
  const all = collectMerchants(txs, [{ match: "costco" }], "all");
  assert.deepEqual(all.map((m) => m.name), ["SQ *BLUE BOTTLE", "ACME PAYROLL", "MYSTERY LLC"]);
  assert.equal(all[2].current, "Uncategorized");
  assert.deepEqual(collectMerchants(txs, [], "uncategorized").map((m) => m.name), ["MYSTERY LLC"]);

  const choices = reviewChoices(DEFAULT_CATEGORIES);
  assert.ok(!choices.some((c) => c.name === "Uncategorized"));
  const idx = (n: string) => choices.findIndex((c) => c.name === n);
  const { system, user } = buildReviewPrompt(choices, all);
  assert.ok(system.includes(`${idx("Coffee Shops")}|Coffee Shops|Food & Dining|expense`));
  assert.ok(user.includes("0|SQ *BLUE BOTTLE|5|-6.00|Restaurants & Bars"));

  const reply = [
    [0, idx("Coffee Shops"), "Blue Bottle"], // changed + renamed
    [1, idx("Other Income")], // same as current -> dropped
    [2, -1], // unsure -> dropped
    [2, idx("Shopping")], // first answer for 2 was -1 (not counted as seen) -> accepted
    [0, idx("Groceries")], // duplicate merchant -> dropped
    [99, 1], ["x", 2], "junk", [1, 9999], // garbage -> dropped
  ];
  assert.deepEqual(parseReview(reply, choices, all), [
    { merchant: "SQ *BLUE BOTTLE", category: "Coffee Shops", cleanName: "Blue Bottle" },
    { merchant: "MYSTERY LLC", category: "Shopping", cleanName: undefined },
  ]);
  // money going out is never filed as income
  assert.deepEqual(parseReview([[0, idx("Paychecks")]], choices, all), []);
  assert.deepEqual(parseReview({ not: "an array" }, choices, all), []);
});
