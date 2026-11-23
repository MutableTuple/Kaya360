import "server-only";
import { env } from "../env";
import { assertWithinBudget, providerFetch, recordUsage, requireCredentials } from "./registry";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

interface Completion {
  choices: Array<{ message: ChatMessage; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// Rough cost estimate per 1M tokens (gpt-4o-mini class); adjust via OPENAI_COST_IN/OUT.
const COST_IN = Number(process.env.OPENAI_COST_IN ?? 0.15) / 1e6;
const COST_OUT = Number(process.env.OPENAI_COST_OUT ?? 0.6) / 1e6;

export async function chat(messages: ChatMessage[], opts: { tools?: ToolDef[]; jsonSchema?: { name: string; schema: Record<string, unknown> }; temperature?: number; jobId?: string; userId?: string; operation?: string; maxTokens?: number } = {}) {
  const { api_key } = await requireCredentials("openai");
  await assertWithinBudget("openai");
  const body: Record<string, unknown> = {
    model: env.openaiModel(), messages, temperature: opts.temperature ?? 0.1, max_tokens: opts.maxTokens ?? 3000,
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonSchema) body.response_format = { type: "json_schema", json_schema: { name: opts.jsonSchema.name, schema: opts.jsonSchema.schema, strict: true } };
  try {
    const j = (await providerFetch("openai", "https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), timeoutMs: 60_000,
    })) as Completion;
    const cost = j.usage ? j.usage.prompt_tokens * COST_IN + j.usage.completion_tokens * COST_OUT : undefined;
    await recordUsage({ provider: "openai", operation: opts.operation ?? "chat", success: true, cost, units: j.usage ? j.usage.prompt_tokens + j.usage.completion_tokens : 1, jobId: opts.jobId, userId: opts.userId });
    return j.choices[0];
  } catch (e) {
    await recordUsage({ provider: "openai", operation: opts.operation ?? "chat", success: false, error: (e as Error).message, jobId: opts.jobId, userId: opts.userId });
    throw e;
  }
}

export async function chatJSON<T>(system: string, user: string, schema: { name: string; schema: Record<string, unknown> }, o: { jobId?: string; userId?: string; operation?: string } = {}): Promise<T> {
  const r = await chat([{ role: "system", content: system }, { role: "user", content: user }], { jsonSchema: schema, ...o });
  return JSON.parse(r.message.content ?? "{}") as T;
}
