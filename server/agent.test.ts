import { describe, expect, it, vi } from "vitest";
import { createToolSession, runNemotronAgent, toolDefinitions } from "./agent";
import type { AgentContext } from "./agent";
import { seed } from "../src/seed";
import { simulate } from "../src/engine";
import { mergeEvents } from "../src/state";

function context(mode: AgentContext["mode"] = "branch"): AgentContext {
  const s = seed();
  return {
    prompt: "What if I got a $90,000 job two months after moving?",
    mode,
    profile: s.profile,
    universes: s.universes,
    selectedUniverseId: s.universes[0].id,
    history: [],
  };
}
const job = {
  kind: "salary",
  label: "A completely model-chosen label",
  month: 7,
  amount: 90000,
  estimated: false,
};
const scenario = {
  operation: "branch",
  name: "NYC with a new career",
  description: "A new job two months after moving.",
  events: [job],
  assumptions: ["Annual gross salary $90,000 starting month 7"],
};
function completion(name: string, args: unknown, id = "call-1") {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}
describe("financial tool dispatcher", () => {
  it("keeps the model-selected action stable and only exposes applicable preview tools", () => {
    const ctx = context();
    const session = createToolSession(ctx);
    expect(session.availableTools().map((tool) => tool.function.name)).toEqual([
      "select_action",
    ]);
    session.execute("select_action", {
      action: "create_child_timeline",
      timelineId: ctx.selectedUniverseId,
    });
    const available = session.availableTools();
    expect(
      available.some((tool) => tool.function.name === "preview_reality_update"),
    ).toBe(false);
    expect(
      available.some((tool) => tool.function.name === "apply_preview"),
    ).toBe(false);
    expect(
      available.some((tool) => tool.function.name === "ask_clarification"),
    ).toBe(false);
    expect(() =>
      session.execute("preview_reality_update", {
        changes: { annualSalary: 90000 },
      }),
    ).toThrow(/selected action/);
    const preview = session.execute("simulate_scenario", scenario)
      .output as any;
    expect(preview.operation).toBe("branch");
    expect(
      session
        .availableTools()
        .some((tool) => tool.function.name === "apply_preview"),
    ).toBe(true);
    expect(
      session.execute("apply_preview", {
        previewId: preview.previewId,
        explanation: "The engine calculated this branch.",
      }).final?.operation,
    ).toBe("branch");
  });
  it("previews an independent branch and returns engine results without mutating the snapshot", () => {
    const ctx = context(),
      before = JSON.stringify(ctx),
      session = createToolSession(ctx);
    expect(() => session.execute("simulate_scenario", scenario)).toThrow(
      /get_timeline/,
    );
    session.execute("get_timeline", { timelineId: ctx.selectedUniverseId });
    const preview = session.execute("simulate_scenario", scenario)
      .output as any;
    const expected = simulate(ctx.profile, [
      ...ctx.universes[0].events,
      { ...job, id: "job" },
    ] as any)[36];
    expect(preview.after.checkpoints.at(-1).netWorth).toBe(expected.netWorth);
    expect(preview.events).toHaveLength(4);
    expect(preview.persisted).toBe(false);
    expect(() =>
      session.execute("answer_question", {
        answer: "Here is your simulation.",
      }),
    ).toThrow(/apply_preview/);
    const final = session.execute("apply_preview", {
      previewId: preview.previewId,
      explanation: "Engine-backed explanation.",
    }).final!;
    expect(final.targetUniverseId).toBe(ctx.selectedUniverseId);
    expect(final.explicitOperations).toBe(true);
    expect(final.events[0].label).toBe(job.label);
    expect(JSON.stringify(ctx)).toBe(before);
  });
  it("uses explicit event IDs instead of labels and preserves separately scheduled events", () => {
    const ctx = context("modify"),
      u = ctx.universes[0],
      session = createToolSession(ctx);
    session.execute("get_timeline", { timelineId: u.id });
    const rent = u.events.find((e) => e.kind === "rent")!;
    const replacing = {
      ...rent,
      label: "Completely renamed rent",
      month: 6,
      amount: 2100,
      replaceEventId: rent.id,
    };
    const { id: _id, ...event } = replacing;
    const preview = session.execute("simulate_scenario", {
      ...scenario,
      operation: "modify",
      events: [],
      replacements: [event],
    }).output as any;
    expect(preview.events.find((e: any) => e.id === rent.id)).toMatchObject({
      label: "Completely renamed rent",
      amount: 2100,
      month: 6,
    });
    expect(preview.events.find((e: any) => e.kind === "expense").amount).toBe(
      4500,
    );
    const added = mergeEvents(
      u.events,
      [
        {
          kind: "rent",
          label: rent.label,
          month: 12,
          amount: 2600,
          estimated: true,
        },
      ],
      [],
      true,
    );
    expect(added.filter((e) => e.kind === "rent")).toHaveLength(2);
    expect(() =>
      session.execute("simulate_scenario", {
        ...scenario,
        events: [],
        replacements: [{ ...job, replaceEventId: "invented-id" }],
      }),
    ).toThrow(/Unknown event/);
  });
  it("rejects arbitrary balance writes, invalid arguments, and invented preview IDs", () => {
    const session = createToolSession(context());
    expect(() => session.execute("set_balance", { savings: 999999 })).toThrow(
      /Unknown tool/,
    );
    expect(() =>
      session.execute("get_financial_profile", { savings: 999999 }),
    ).toThrow();
    expect(() =>
      session.execute("apply_preview", {
        previewId: "fake",
        explanation: "Done",
      }),
    ).toThrow(/Unknown preview/);
    expect(() =>
      session.execute("get_monthly_projection", { month: 999 }),
    ).toThrow();
  });
  it("answers questions without creating a scenario after reading financial facts", () => {
    const ctx = context(),
      original = JSON.stringify(ctx),
      session = createToolSession(ctx);
    expect(() =>
      session.execute("answer_question", { answer: "Made up" }),
    ).toThrow(/Read relevant/);
    const result = session.execute("get_monthly_projection", { month: 12 })
      .output as any;
    expect(result.projection).toEqual(simulate(ctx.profile)[12]);
    const final = session.execute("answer_question", {
      answer: "Your forecast is available above.",
    }).final!;
    expect(final.answer).toBeTruthy();
    expect(final.events).toEqual([]);
    expect(final.reality).toBeUndefined();
    expect(JSON.stringify(ctx)).toBe(original);
  });
  it("previews reality recalculations without mutating finances and preserves hypothetical choices", () => {
    const ctx = context("branch"),
      before = JSON.stringify(ctx),
      session = createToolSession(ctx);
    const preview = session.execute("preview_reality_update", {
      changes: { annualSalary: 90000 },
    }).output as any;
    expect(preview.timelines[0].before.viable).toBe(false);
    expect(preview.timelines[0].after.viable).toBe(true);
    expect(preview.after.checkpoints[0].netWorth).toBe(
      preview.before.checkpoints[0].netWorth,
    );
    const final = session.execute("apply_preview", {
      previewId: preview.previewId,
      explanation: "The move is now viable.",
    }).final!;
    expect(final.reality?.annualSalary).toBe(90000);
    expect(final.operation).toBe("reality");
    expect(JSON.stringify(ctx)).toBe(before);
    session.execute("get_timeline", { timelineId: ctx.selectedUniverseId });
    const hypothetical = session.execute("simulate_scenario", scenario)
      .output as any;
    expect(hypothetical.operation).toBe("branch");
  });
  it("returns the specifically chosen preview rather than the last alternative explored", () => {
    const ctx = context(),
      session = createToolSession(ctx);
    session.execute("get_timeline", { timelineId: ctx.selectedUniverseId });
    session.execute("simulate_scenario", scenario);
    session.execute("simulate_scenario", {
      ...scenario,
      events: [{ ...job, amount: 100000 }],
    });
    expect(
      session.execute("apply_preview", {
        previewId: "scenario-1",
        explanation: "Use the first option.",
      }).final!.events[0].amount,
    ).toBe(90000);
  });
});

describe("Nemotron function-calling protocol", () => {
  it("reports rejected credentials and retired deployments clearly", async () => {
    for (const status of [403, 410]) {
      const fetcher = vi.fn(
        async () => new Response("", { status }),
      ) as unknown as typeof fetch;
      await expect(
        runNemotronAgent(context(), { NEMOTRON_API_KEY: "test-only" }, fetcher),
      ).rejects.toThrow(
        status === 403
          ? /authorization failed.*403/
          : /no longer available.*410/,
      );
    }
  });
  it("sends native tool definitions, supplies tool results back to the model, and returns the chosen command", async () => {
    const ctx = context();
    let round = 0;
    const sent: any[] = [];
    const fetcher = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      sent.push(request);
      round++;
      if (round === 1)
        return Response.json(
          completion(
            "select_action",
            {
              action: "create_child_timeline",
              timelineId: ctx.selectedUniverseId,
            },
            "intent",
          ),
        );
      if (round === 2)
        return Response.json(
          completion(
            "get_timeline",
            { timelineId: ctx.selectedUniverseId },
            "read",
          ),
        );
      if (round === 3) {
        expect(request.messages.at(-1).tool_call_id).toBe("read");
        return Response.json(
          completion("simulate_scenario", scenario, "simulate"),
        );
      }
      const toolResult = JSON.parse(request.messages.at(-1).content);
      expect(toolResult.after.checkpoints.at(-1).netWorth).toBeGreaterThan(0);
      return Response.json(
        completion(
          "apply_preview",
          {
            previewId: toolResult.previewId,
            explanation: "Your new salary makes this path viable.",
          },
          "finish",
        ),
      );
    }) as unknown as typeof fetch;
    const result = await runNemotronAgent(
      ctx,
      { NEMOTRON_API_KEY: "test-only" },
      fetcher,
    );
    expect(result.data.events).toEqual([job]);
    expect(result.data.explanation).toContain("viable");
    expect(result.tools.map((t) => t.tool)).toEqual([
      "select_action",
      "get_timeline",
      "simulate_scenario",
      "apply_preview",
    ]);
    expect(sent[0].tools.map((tool: any) => tool.function.name)).toEqual([
      "select_action",
    ]);
    expect(
      sent[1].tools.some(
        (tool: any) => tool.function.name === "simulate_scenario",
      ),
    ).toBe(true);
    expect(
      sent[1].tools.some(
        (tool: any) => tool.function.name === "preview_reality_update",
      ),
    ).toBe(false);
    expect(
      sent[1].tools.some((tool: any) => tool.function.name === "apply_preview"),
    ).toBe(false);
    expect(sent[0].tool_choice).toBe("required");
    expect(sent[0].response_format).toBeUndefined();
  });
  it("feeds malformed/unknown calls back as tool errors so the model can recover", async () => {
    let round = 0;
    const fetcher = vi.fn(async (_url: any, init: any) => {
      round++;
      if (round === 1)
        return Response.json(
          completion(
            "select_action",
            { action: "create_child_timeline" },
            "intent",
          ),
        );
      const request = JSON.parse(init.body);
      if (round === 2)
        return Response.json(completion("delete_everything", {}));
      expect(JSON.parse(request.messages.at(-1).content)).toMatchObject({
        changed: false,
      });
      return Response.json(
        completion(
          "ask_clarification",
          { question: "Which timeline do you mean?" },
          "finish",
        ),
      );
    }) as unknown as typeof fetch;
    const result = await runNemotronAgent(
      context(),
      { NEMOTRON_API_KEY: "test-only" },
      fetcher,
    );
    expect(result.tools[1].status).toBe("error");
    expect(result.data.clarification).toContain("Which timeline");
  });
  it("stops endless tool loops without applying any changes", async () => {
    const ctx = context(),
      original = JSON.stringify(ctx);
    const fetcher = vi.fn(async () =>
      Response.json(completion("get_financial_profile", {})),
    ) as unknown as typeof fetch;
    await expect(
      runNemotronAgent(ctx, { NEMOTRON_API_KEY: "test-only" }, fetcher),
    ).rejects.toThrow(/limit/);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(JSON.stringify(ctx)).toBe(original);
  });
  it("never silently falls back to demo rules on a provider failure", async () => {
    const fetcher = vi.fn(
      async () => new Response("no", { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(
      runNemotronAgent(context(), { NEMOTRON_API_KEY: "bad" }, fetcher),
    ).rejects.toThrow(/401/);
  });
});
