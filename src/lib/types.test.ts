import assert from "node:assert/strict";
import test from "node:test";
import { paymentKind } from "./types";

test("payment kind follows the account type", () => {
  assert.equal(paymentKind({ type: "credit" }), "Credit card");
  assert.equal(paymentKind({ type: "checking" }), "Debit");
  assert.equal(paymentKind({ type: "savings" }), "Debit");
  assert.equal(paymentKind({ type: "investment" }), "Investment");
  assert.equal(paymentKind({ type: "loan" }), "Loan");
});
