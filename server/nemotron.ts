import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { interpretDemo } from "../src/interpreter";
import { messageSchema, profileSchema, universeSchema } from "../src/contracts";
import { runNemotronAgent } from "./agent";
const requestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  mode: z.enum(["create", "modify", "branch", "reality"]),
  universe: universeSchema.optional(),
  profile: profileSchema.optional(),
  universes: z.array(universeSchema).max(100).default([]),
  history: z.array(messageSchema).max(20).default([]),
});
export function scenarioApi(env: Record<string, string>): Plugin {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url !== "/api/interpret" && req.url !== "/api/status")
      return next();
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/status") {
      res.end(
        JSON.stringify({
          ai: env.NVIDIA_API_KEY
            ? "Nemotron · tool calling"
            : "Demo interpreter",
        }),
      );
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "POST required" }));
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1000000) throw new Error("Request too large");
      }
      const input = requestSchema.parse(JSON.parse(body));
      if (!env.NVIDIA_API_KEY) {
        res.end(
          JSON.stringify({
            data: interpretDemo(
              input.prompt,
              input.mode,
              input.universe,
              input.profile,
            ),
            source: "Demo interpreter",
            tools: [],
          }),
        );
        return;
      }
      if (!input.profile)
        throw new Error(
          "Financial profile is required for live reasoning. Reload the app and try again.",
        );
      const universes = input.universes.slice();
      if (input.universe && !universes.some((u) => u.id === input.universe!.id))
        universes.push(input.universe);
      if (new Set(universes.map((u) => u.id)).size !== universes.length)
        throw new Error("Timeline IDs must be unique.");
      const result = await runNemotronAgent(
        {
          prompt: input.prompt,
          mode: input.mode,
          profile: input.profile,
          universes,
          selectedUniverseId: input.universe?.id,
          history: input.history,
        },
        env,
      );
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error:
            error instanceof z.ZodError
              ? "The request contained invalid financial data. Reload or try a more specific request."
              : error instanceof Error
                ? error.message
                : "Interpretation failed",
        }),
      );
    }
  };
  return {
    name: "ping-scenario-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
