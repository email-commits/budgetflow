import assert from "node:assert/strict";
import test from "node:test";
import { monthlyCashFlow, spendByCategory } from "./analytics";
import { mapPlaidCategory } from "./plaid";
import { isTransfer, Transaction } from "./types";

test("loan payments map to Debt Payment, card payments to Transfer, mortgage to Housing", () => {
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"), "Debt Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT"), "Debt Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT"), "Debt Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_OTHER_PAYMENT"), "Debt Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", undefined), "Debt Payment");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"), "Transfer");
  assert.equal(mapPlaidCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"), "Housing");
});

test("existing mappings are unchanged", () => {
  assert.equal(mapPlaidCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), "Groceries");
  assert.equal(mapPlaidCategory("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"), "Dining");
  assert.equal(mapPlaidCategory("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"), "Utilities");
  assert.equal(mapPlaidCategory("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"), "Other");
  assert.equal(mapPlaidCategory("INCOME", "INCOME_WAGES"), "Income");
  assert.equal(mapPlaidCategory(undefined, undefined), "Other");
  assert.equal(mapPlaidCategory("SOMETHING_NEW", null), "Other");
});

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  accountId: "a",
  date: "2026-10-10",
  merchant: "m",
  category: "Other",
  amount: -1,
  ...o,
});

test("transfers stay out of spending and income; debt payments count as spending", () => {
  const txs = [
    tx({ category: "Dining", amount: -50 }),
    tx({ category: "Debt Payment", merchant: "Auto Loan", amount: -400 }),
    tx({ category: "Transfer", merchant: "Chase Card Payment", amount: -1500 }), // out of checking
    tx({ category: "Transfer", merchant: "Payment Thank You", amount: 1500 }), // into the card
    tx({ category: "Income", merchant: "Payroll", amount: 3000 }),
  ];
  const byCat = Object.fromEntries(spendByCategory(txs, "2026-10").map((c) => [c.category, c.total]));
  assert.deepEqual(byCat, { "Debt Payment": 400, Dining: 50 });
  assert.deepEqual(monthlyCashFlow(txs), [{ month: "2026-10", income: 3000, spend: 450, net: 2550 }]);
  assert.equal(isTransfer({ category: "Transfer", merchant: "x" }), true);
  assert.equal(isTransfer({ category: "Other", merchant: "Transfer to Savings" }), true);
  assert.equal(isTransfer({ category: "Debt Payment", merchant: "Loan transfer" }), false);
});
