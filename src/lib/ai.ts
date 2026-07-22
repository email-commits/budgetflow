/**
 * Minimal Claude API client (plain fetch, no SDK dependency).
 * Requires ANTHROPIC_API_KEY. Model overridable via AI_MODEL.
 */

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = () => process.env.AI_MODEL ?? "claude-haiku-4-5";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askClaude(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Claude API: ${json?.error?.message ?? resp.statusText}`);
  }
  const text = (json.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  return text;
}

/** Extract the first JSON object/array from a model response (tolerates prose around it). */
export function extractJson<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error("No JSON in model response");
  // walk to matching close
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T;
    }
  }
  throw new Error("Unbalanced JSON in model response");
}
