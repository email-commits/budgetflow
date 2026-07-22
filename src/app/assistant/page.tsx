"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How much did I spend on dining this month vs last?",
  "What are my biggest subscriptions?",
  "How is my savings rate trending?",
  "What did I spend at Amazon in the last 3 months?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const resp = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Something went wrong");
      setMessages((m) => [...m, { role: "assistant", content: json.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((m) => m.slice(0, -1)); // roll back the question so it can be retried
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="text-sm text-ink-muted mt-1">Ask anything about your money — answers come from your own data</p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="card p-6 space-y-3">
            <p className="text-sm text-ink-secondary">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-sm border border-white/10 hover:border-series-1 text-ink-secondary hover:text-ink-primary rounded-xl px-3.5 py-2 text-left transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user" ? "bg-series-1 text-white" : "bg-surface border border-white/10"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-surface border border-white/10 rounded-2xl px-4 py-3 text-sm text-ink-muted animate-pulse">
              Crunching your numbers…
            </div>
          </div>
        )}
        {error && <p className="text-sm text-critical">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. How much did I spend on groceries in June?"
          className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-series-1 text-white text-sm font-medium rounded-xl px-5 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
