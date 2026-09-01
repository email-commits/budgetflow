import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breakdownByInstitution, institutionGroup } from "./institutions";
import { accountTypeLabel, allocationClass, allocationSlices, investedTotal } from "./investments";
import { Account, Holding } from "./types";

describe("allocationClass", () => {
  it("maps official Plaid security types into three buckets", () => {
    assert.equal(allocationClass("equity"), "Equity");
    assert.equal(allocationClass("etf"), "Equity");
    assert.equal(allocationClass("mutual fund"), "Equity");
    assert.equal(allocationClass("fixed income"), "Fixed income");
    assert.equal(allocationClass("cash"), "Cash / other");
    assert.equal(allocationClass("cryptocurrency"), "Cash / other");
    assert.equal(allocationClass("other"), "Cash / other");
    assert.equal(allocationClass(undefined), "Cash / other");
  });
});

describe("allocationSlices", () => {
  it("sums values and omits empty buckets", () => {
    const holdings: Holding[] = [
      { id: "1", accountId: "a", name: "AAPL", type: "equity", quantity: 1, value: 70 },
      { id: "2", accountId: "a", name: "BND", type: "fixed income", quantity: 1, value: 20 },
      { id: "3", accountId: "a", name: "SPAXX", type: "cash", quantity: 10, value: 10 },
    ];
    const slices = allocationSlices(holdings);
    assert.deepEqual(
      slices.map((s) => s.label),
      ["Equity", "Fixed income", "Cash / other"]
    );
    assert.equal(slices[0].value, 70);
  });
});

describe("accountTypeLabel", () => {
  it("formats Plaid subtypes", () => {
    assert.equal(accountTypeLabel({ type: "investment", subtype: "401k" }), "401(k)");
    assert.equal(accountTypeLabel({ type: "investment", subtype: "ira" }), "IRA");
    assert.equal(accountTypeLabel({ type: "investment", subtype: "brokerage" }), "Brokerage");
    assert.equal(accountTypeLabel({ type: "checking", subtype: "checking" }), "Checking");
    assert.equal(accountTypeLabel({ type: "checking" }), "Checking");
  });
});

describe("institution grouping", () => {
  it("buckets Fidelity / T. Rowe / Schwab vs banks", () => {
    assert.equal(institutionGroup("Fidelity Investments"), "Fidelity");
    assert.equal(institutionGroup("T. Rowe Price"), "T. Rowe Price");
    assert.equal(institutionGroup("Charles Schwab"), "Charles Schwab");
    assert.equal(institutionGroup("Chase"), "Banks");
  });

  it("aggregates account balances by group", () => {
    const accounts: Account[] = [
      { id: "1", name: "401k", institution: "Fidelity", type: "investment", mask: "1", balance: 100 },
      { id: "2", name: "Checking", institution: "Chase", type: "checking", mask: "2", balance: 50 },
      { id: "3", name: "Brokerage", institution: "Schwab", type: "investment", mask: "3", balance: 25 },
    ];
    const rows = breakdownByInstitution(accounts);
    assert.equal(investedTotal(accounts), 125);
    assert.deepEqual(
      rows.map((r) => [r.group, r.total]),
      [
        ["Fidelity", 100],
        ["Charles Schwab", 25],
        ["Banks", 50],
      ]
    );
  });
});
