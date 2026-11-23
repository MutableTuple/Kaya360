import { z } from "zod";
import { route, body, sanitize } from "@/lib/api";
import { runAssistant } from "@/lib/assistant";

export const maxDuration = 60;
const M = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40) });

export const POST = route(async (req, ctx) => {
  const { messages } = M.parse(sanitize(await body(req)));
  return runAssistant(ctx, messages);
}, { limit: 20 });
