"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppData } from "@/components/DataProvider";
import { fmtUSD, fmtUSD0 } from "@/lib/analytics";
import { Bill, billStatus, BillStatus } from "@/lib/bills";

const STATE_META: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid ✓", cls: "text-good border-good/40" },
  overpaid: { label: "Overpaid ⚠", cls: "text-critical border-critical/40" },
  underpaid: { label: "Underpaid", cls: "text-warning border-warning/40" },
  "due-soon": { label: "Due soon", cls: "text-warning border-warning/40" },
  upcoming: { label: "Upcoming", cls: "text-ink-muted border-white/20" },
  missed: { label: "MISSED", cls: "text-critical border-critical/60 font-semibold" },
};

const STATE_ORDER: Record<string, number> = { missed: 0, overpaid: 1, underpaid: 2, "due-soon": 3, upcoming: 4, paid: 5 };

export default function BillsPage() {
  const { data, loading } = useAppData();
  const [bills, setBills] = useState<Bill[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", match: "", expectedAmount: "", dueDay: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ expectedAmount: "", dueDay: "", tolerance: "" });

  const loadBills = useCallback(async () => {
    try {
      const resp = await fetch("/api/bills");
      const json = await resp.json();
      setBills(json.bills ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const statuses: BillStatus[] = bills
    .filter((b) => b.active)
    .map((b) => billStatus(b, data.transactions))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.daysUntilDue - b.daysUntilDue);

  const problems = statuses.filter((s) => ["missed", "overpaid", "underpaid"].includes(s.state)).length;
  const monthlyTotal = bills.filter((b) => b.active).reduce((s, b) => s + b.expectedAmount, 0);

  const importRecurring = async () => {
    setBusy(true);
    setNote(null);
    try {
      const resp = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importRecurring: true }),
      });
      const json = await resp.json();
      setNote(json.created > 0 ? `Imported ${json.created} bills from detected recurring charges.` : "No new bills to import.");
      await loadBills();
    } finally {
      setBusy(false);
    }
  };

  const addBill = async () => {
    setBusy(true);
    setNote(null);
    try {
      const resp = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          match: form.match || form.name,
          expectedAmount: Number(form.expectedAmount),
          dueDay: Number(form.dueDay),
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      setAdding(false);
      setForm({ name: "", match: "", expectedAmount: "", dueDay: "" });
      await loadBills();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed to add bill");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    try {
      await fetch("/api/bills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          expectedAmount: Number(editForm.expectedAmount),
          dueDay: Number(editForm.dueDay),
          tolerance: Number(editForm.tolerance) / 100,
        }),
      });
      await loadBills();
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const removeBill = async (id: string) => {
    await fetch(`/api/bills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadBills();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-ink-muted mt-1">
            {bills.filter((b) => b.active).length} monitored · ≈{fmtUSD0(monthlyTotal)}/mo expected
            {problems > 0 && <span className="text-critical"> · {problems} need attention</span>}
          </p>
        </div>
        {data.editable && (
          <div className="flex gap-3 text-sm">
            <button onClick={importRecurring} disabled={busy} className="text-series-1 hover:underline disabled:opacity-50">
              Import detected
            </button>
            <button onClick={() => setAdding((a) => !a)} className="text-series-1 hover:underline">
              {adding ? "Cancel" : "+ Add bill"}
            </button>
          </div>
        )}
      </header>

      {note && <p className="text-sm text-ink-secondary">{note}</p>}

      {adding && (
        <div className="card p-5 flex flex-wrap gap-2 items-center">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Bill name (e.g. Rent)"
            className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-44 outline-none focus:border-series-1 placeholder:text-ink-muted"
          />
          <input
            value={form.match}
            onChange={(e) => setForm({ ...form, match: e.target.value })}
            placeholder="Merchant contains (optional)"
            className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-52 outline-none focus:border-series-1 placeholder:text-ink-muted"
          />
          <input
            value={form.expectedAmount}
            onChange={(e) => setForm({ ...form, expectedAmount: e.target.value.replace(/[^0-9.]/g, "") })}
            placeholder="Expected ($)"
            className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-28 outline-none focus:border-series-1 placeholder:text-ink-muted"
          />
          <input
            value={form.dueDay}
            onChange={(e) => setForm({ ...form, dueDay: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Due day (1-31)"
            className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-32 outline-none focus:border-series-1 placeholder:text-ink-muted"
          />
          <button
            onClick={addBill}
            disabled={busy || !form.name || !form.expectedAmount || !form.dueDay}
            className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {statuses.length === 0 && !adding && (
        <div className="card p-10 text-center text-sm text-ink-secondary">
          No bills monitored yet. Click <b>Import detected</b> to seed from your recurring charges, or add bills
          manually.
        </div>
      )}

      <div className="card p-2">
        {statuses.map((s) => {
          const meta = STATE_META[s.state];
          const isEditing = editingId === s.bill.id;
          return (
            <div key={s.bill.id} className="px-4 py-3 hover:bg-surface2 rounded-xl">
              <div className="flex items-center gap-4">
                <span className={`text-xs px-2.5 py-1 rounded-full border shrink-0 w-24 text-center ${meta.cls}`}>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.bill.name}</div>
                  <div className="text-xs text-ink-muted">
                    {s.state === "paid" || s.state === "overpaid" || s.state === "underpaid"
                      ? `Paid ${fmtUSD(s.paidAmount ?? 0)} on ${s.paidDate}`
                      : s.state === "missed"
                        ? `Was due ${s.dueDate} — no payment found`
                        : `Due ${s.dueDate} (${s.daysUntilDue}d)`}
                    {s.historicalAvg !== undefined && ` · avg ${fmtUSD0(s.historicalAvg)}`}
                    {s.bill.statementAmount != null && (
                      <span className={s.statementVerified ? "text-good" : ""}>
                        {" · biller says "}
                        {fmtUSD(s.bill.statementAmount)}
                        {s.statementVerified && " ✓"}
                      </span>
                    )}
                  </div>
                  {s.bill.planInfo && (
                    <div className="text-xs text-ink-muted mt-0.5 truncate max-w-md" title={s.bill.planInfo}>
                      Plan: {s.bill.planInfo}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-ink-muted">$</span>
                    <input
                      value={editForm.expectedAmount}
                      onChange={(e) => setEditForm({ ...editForm, expectedAmount: e.target.value.replace(/[^0-9.]/g, "") })}
                      className="w-20 bg-surface border border-white/10 rounded-lg px-2 py-1 tabular outline-none"
                    />
                    <span className="text-ink-muted">day</span>
                    <input
                      value={editForm.dueDay}
                      onChange={(e) => setEditForm({ ...editForm, dueDay: e.target.value.replace(/[^0-9]/g, "") })}
                      className="w-12 bg-surface border border-white/10 rounded-lg px-2 py-1 tabular outline-none"
                    />
                    <span className="text-ink-muted">±%</span>
                    <input
                      value={editForm.tolerance}
                      onChange={(e) => setEditForm({ ...editForm, tolerance: e.target.value.replace(/[^0-9]/g, "") })}
                      className="w-12 bg-surface border border-white/10 rounded-lg px-2 py-1 tabular outline-none"
                    />
                    <button onClick={() => saveEdit(s.bill.id)} disabled={busy} className="text-series-1">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-ink-muted">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm tabular font-medium ${
                          s.state === "overpaid" ? "text-critical" : s.state === "underpaid" ? "text-warning" : ""
                        }`}
                      >
                        {s.paidAmount !== undefined ? fmtUSD(s.paidAmount) : fmtUSD0(s.bill.expectedAmount)}
                      </div>
                      <div className="text-xs text-ink-muted tabular">
                        expected {fmtUSD0(s.bill.expectedAmount)} ±{Math.round(s.bill.tolerance * 100)}%
                      </div>
                    </div>
                    {data.editable && (
                      <div className="flex flex-col gap-1 text-xs shrink-0">
                        <button
                          onClick={() => {
                            setEditingId(s.bill.id);
                            setEditForm({
                              expectedAmount: String(s.bill.expectedAmount),
                              dueDay: String(s.bill.dueDay),
                              tolerance: String(Math.round(s.bill.tolerance * 100)),
                            });
                          }}
                          className="text-ink-muted hover:text-ink-primary"
                        >
                          Edit
                        </button>
                        <button onClick={() => removeBill(s.bill.id)} className="text-ink-muted hover:text-critical">
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
