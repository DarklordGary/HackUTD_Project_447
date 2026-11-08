import type { Mode, Profile, Universe, Message } from "./types";
import { interpretationSchema } from "./contracts";
import type { Interpretation } from "./contracts";
export async function interpret(
  prompt: string,
  mode: Mode,
  universe?: Universe,
  profile?: Profile,
  universes: Universe[] = [],
  history: Message[] = [],
  operationId?: string,
  activeGoalId?: string,
): Promise<{
  data: Interpretation;
  source: string;
  tools: { tool: string; status: "ok" | "error" }[];
}> {
  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      operationId, activeGoalId,
      mode,
      universe: universe ? { ...universe, messages: [] } : undefined,
      profile,
      universes: universes.map((u) => ({ ...u, messages: [] })),
      history: history.slice(-20),
    }),
    signal: AbortSignal.timeout(100000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || "The interpreter is unavailable. Please try again.",
    );
  }
  const body = await response.json();
  return {
    data: interpretationSchema.parse(body.data),
    source: body.source,
    tools: Array.isArray(body.tools) ? body.tools : [],
  };
}
