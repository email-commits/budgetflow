"use client";

import { useState } from "react";
import { useAppData } from "@/components/DataProvider";
import { fmtUSD0 } from "@/lib/analytics";
import { goalStatus } from "@/lib/goals";

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

export default function GoalsPage() {
  const { data, loading, refresh } = useAppData();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"save" | "payoff">("save");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressEditId, setProgressEditId] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState("");

  if (loading || !data) {
    return <div className="text-ink-muted text-sm animate-pulse py-20 text-center">Loading…</div>;
  }

  const goals = (data.goals ?? []).map((g) => goalStatus(g, data.accounts));
  const saveAccounts = data.accounts.filter((a) => a.type === "checking" || a.type === "savings" || a.type === "investment");
  const debtAccounts = data.accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const linkOptions = kind === "payoff" ? debtAccounts : saveAccounts;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind,
          targetAmount: kind === "save" ? Number(target) : undefined,
          targetDate: date || undefined,
          accountId: accountId || undefined,
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      setAdding(false);
      setName("");
      setTarget("");
      setDate("");
      setAccountId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create goal");
    } finally {
      setBusy(false);
    }
  };

  const saveProgress = async (id: string) => {
    setBusy(true);
    try {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, manualProgress: Number(progressValue) }),
      });
      await refresh();
      setProgressEditId(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-ink-muted mt-1">
            {goals.length === 0 ? "Set a target and watch it fill up" : `${goals.filter((g) => g.done).length} of ${goals.length} complete`}
          </p>
        </div>
        {data.editable && (
          <button onClick={() => setAdding((a) => !a)} className="text-sm text-series-1 hover:underline">
            {adding ? "Cancel" : "+ New goal"}
          </button>
        )}
      </header>

      {adding && (
        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goal name (e.g. Emergency fund)"
              className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-60 outline-none focus:border-series-1 placeholder:text-ink-muted"
            />
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as "save" | "payoff");
                setAccountId("");
              }}
              className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
            >
              <option value="save">Save up</option>
              <option value="payoff">Pay off debt</option>
            </select>
            {kind === "save" && (
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Target ($)"
                className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-28 outline-none focus:border-series-1 placeholder:text-ink-muted"
              />
            )}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none max-w-[220px]"
            >
              <option value="">{kind === "payoff" ? "Pick debt account…" : "Track manually (no account)"}</option>
              {linkOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.institution})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none text-ink-secondary"
            />
            <button
              onClick={add}
              disabled={busy || !name.trim() || (kind === "save" && !target) || (kind === "payoff" && !accountId)}
              className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
            >
              Create
            </button>
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>
      )}

      {goals.length === 0 && !adding && (
        <div className="card p-10 text-center text-sm text-ink-secondary">
          No goals yet. Try &ldquo;Emergency fund — $20,000&rdquo; linked to your savings account, or
          &ldquo;Pay off the card&rdquo; linked to a credit card.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map((s) => (
          <div key={s.goal.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {s.goal.name}
                  {s.done && <span className="text-xs text-good">✓ Complete</span>}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {s.goal.kind === "payoff" ? "Debt payoff" : "Savings"}
                  {s.accountName && ` · ${s.accountName}`}
                  {s.goal.targetDate && ` · by ${fmtDate(s.goal.targetDate)}`}
                </div>
              </div>
              <button onClick={() => remove(s.goal.id)} className="text-xs text-ink-muted hover:text-critical">
                Delete
              </button>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="tabular font-medium">{fmtUSD0(s.current)}</span>
                <span className="text-ink-muted tabular">of {fmtUSD0(s.target)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${s.pct}%`, background: s.done ? "#0ca30c" : "#3987e5" }}
                />
              </div>
            </div>

            <div className="text-xs text-ink-muted space-y-1">
              {s.neededPerMonth !== undefined && (
                <div>
                  Needs <b className="text-ink-secondary">{fmtUSD0(s.neededPerMonth)}/mo</b> to hit the date
                </div>
              )}
              {s.projectedDate && (
                <div>
                  At your pace ({fmtUSD0(s.monthlyPace ?? 0)}/mo): done ~<b className="text-ink-secondary">{fmtDate(s.projectedDate)}</b>
                  {s.onTrack !== undefined && (
                    <span className={s.onTrack ? "text-good" : "text-warning"}> {s.onTrack ? "· on track" : "· behind"}</span>
                  )}
                </div>
              )}
              {!s.goal.accountId && s.goal.kind === "save" && (
                <div className="flex items-center gap-2 pt-1">
                  {progressEditId === s.goal.id ? (
                    <>
                      <input
                        value={progressValue}
                        onChange={(e) => setProgressValue(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-24 bg-surface2 border border-white/10 rounded-lg px-2 py-1 text-xs tabular outline-none focus:border-series-1"
                        autoFocus
                      />
                      <button onClick={() => saveProgress(s.goal.id)} disabled={busy} className="text-series-1">
                        Save
                      </button>
                      <button onClick={() => setProgressEditId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setProgressEditId(s.goal.id);
                        setProgressValue(String(s.goal.manualProgress));
                      }}
                      className="text-series-1 hover:underline"
                    >
                      Update progress
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
