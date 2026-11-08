import { describe, expect, it, vi } from "vitest";
import { createToolSession, runNemotronAgent } from "./agent";
import type { AgentContext } from "./agent";
import { seedExamples as seed } from "../src/seed-fixtures.test-support";
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
  it("scopes discarding a plan to an archive preview without salary tools", () => {
    const ctx = context();
    ctx.prompt = `Forget ${ctx.universes[0].name}`;
    const session = createToolSession(ctx);
    session.execute("select_action", { action: "archive_plan", reportedAs: "plan_management", requestedChanges: ["plan_status"], salaryMeaning: "none", scenarioKind: "general", timelineId: ctx.selectedUniverseId });
    const names = session.availableTools().map(t => t.function.name);
    expect(names).toContain("resolve_plan_reference");
    expect(names).not.toContain("preview_archive_plan");
    expect(names).not.toContain("preview_salary_change");
    expect(names).not.toContain("preview_reality_update");
    session.execute("resolve_plan_reference", { referenceType: "named", referenceText: ctx.universes[0].name });
    const preview = session.execute("preview_archive_plan", { timelineId: ctx.selectedUniverseId }).output as any;
    expect(preview.actualFinancesChanged).toBe(false);
    expect(ctx.universes[0].archived).toBeUndefined();
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Discarded." }).final!;
    expect(command.operation).toBe("archive");
    expect(command.targetUniverseId).toBe(ctx.selectedUniverseId);
    expect(command.reality).toBeUndefined();
  });
  it("does not accept Seattle's ID for an ambiguous Denver reference in a fresh chat", () => {
    const ctx = context();
    const [seattle, denver, connection] = ctx.universes;
    seattle.name = "Seattle Move"; denver.name = "Denver Move"; connection.name = "Seattle → Denver Move";
    ctx.prompt = "forget about denver"; ctx.selectedUniverseId = undefined; ctx.activeGoalId = undefined; ctx.history = [];
    const session = createToolSession(ctx);
    session.execute("select_action", { action: "archive_plan", reportedAs: "plan_management", timelineId: seattle.id });
    expect(() => session.execute("preview_archive_plan", { timelineId: seattle.id })).toThrow(/Resolve/);
    expect(() => session.execute("resolve_plan_reference", { referenceType: "context", referenceText: "it" })).toThrow(/CURRENT/);
    expect(() => session.execute("resolve_plan_reference", { referenceType: "named", referenceText: "Seattle" })).toThrow(/CURRENT/);
    const found = session.execute("resolve_plan_reference", { referenceType: "named", referenceText: "denver" }).output as any;
    expect(found.status).toBe("ambiguous");
    expect(found.candidates.map((c: any) => c.id)).toEqual([denver.id, connection.id]);
    expect(found.question).toContain("Denver Move");
    expect(found.question).toContain("Seattle → Denver Move");
    expect(session.availableTools().some(t => t.function.name === "preview_archive_plan")).toBe(false);
    expect(() => session.execute("preview_archive_plan", { timelineId: denver.id })).toThrow(/ambiguous/);
    expect(ctx.universes.every(u => !u.archived)).toBe(true);
  });
  it("resolves an explicit full plan name rather than an overlapping longer name", () => {
    const ctx = context();
    ctx.universes[0].name = "Seattle Move"; ctx.universes[1].name = "Denver Move"; ctx.universes[2].name = "Seattle → Denver Move";
    ctx.prompt = "Please archive Denver Move";
    const session = createToolSession(ctx);
    session.execute("select_action", { action: "archive_plan", timelineId: ctx.universes[0].id });
    const found = session.execute("resolve_plan_reference", { referenceType: "named", referenceText: "Denver Move" }).output as any;
    expect(found.resolvedTimelineId).toBe(ctx.universes[1].id);
    expect(() => session.execute("preview_archive_plan", { timelineId: ctx.universes[0].id })).toThrow(/unique plan ID/);
  });
  it("calculates a follow-up job date from the selected original event without moving that event", () => {
    const ctx = context();
    const parent = ctx.universes[0];
    const session = createToolSession(ctx);
    session.execute("select_action", { reportedAs: "hypothetical", requestedChanges: ["salary"], salaryMeaning: "annual_total", scenarioKind: "general", action: "create_child_timeline", timelineId: parent.id });
    const preview = session.execute("preview_followup_salary", { timelineId: parent.id, referenceEventId: parent.events[0].id, monthsAfter: 2, salaryMode: "absolute", salaryValue: 95000, name: "Job after move" }).output as any;
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Calculated follow-up." }).final!;
    expect(command.events[0].month).toBe(parent.events[0].month + 2);
    expect(command.events).toHaveLength(1);
    expect(command.events[0].replaceEventId).toBeUndefined();
    expect(command.branchOrigin).toBeUndefined();
  });
  it("requires an actual reported change to use a reality action, even with a selected hypothetical", () => {
    const session = createToolSession(context());
    expect(() => session.execute("select_action", {
      reportedAs: "actual", requestedChanges: ["salary"], scenarioKind: "general",
      action: "create_alternative_from_reality", timelineId: context().selectedUniverseId,
    })).toThrow(/actual/);
    session.execute("select_action", { reportedAs: "actual", requestedChanges: ["salary"], salaryMeaning: "annual_increase", effectiveTiming: "now", scenarioKind: "general", action: "update_real_life" });
    const tools = session.availableTools().map(t => t.function.name);
    expect(tools).toContain("preview_salary_change");
    expect(tools).not.toContain("preview_plan_revision");
    expect(tools).not.toContain("preview_dated_salary_change");
    expect(() => session.execute("preview_reality_update", { changes: { effectiveDate: "2099-01-01", salaryChange: { mode: "delta", value: 8000, baseline: 72000, purpose: "prerequisite" } } })).toThrow(/effective now/);
  });
  it("rejects a delay-only preview when the model identified a raise and a delay", () => {
    const ctx = context();
    ctx.universes[0].events = ctx.universes[0].events.map(e => ({ ...e, groupId: "move" }));
    const session = createToolSession(ctx);
    session.execute("select_action", { reportedAs: "hypothetical", requestedChanges: ["salary", "move_timing"], salaryMeaning: "annual_increase", effectiveTiming: "now", scenarioKind: "move", action: "create_alternative_from_reality", timelineId: ctx.selectedUniverseId });
    expect(() => session.execute("preview_plan_revision", { timelineId: ctx.selectedUniverseId, groupId: "move", delayMonths: 4, name: "Incomplete" })).toThrow(/salary change/);
    expect(() => session.execute("preview_plan_revision", { timelineId: ctx.selectedUniverseId, groupId: "move", delayMonths: 4, name: "Wrong salary semantics", salaryMode: "absolute", salaryValue: 15000, salaryMonth: 1 })).toThrow(/mode=delta/);
    const preview = session.execute("preview_plan_revision", { timelineId: ctx.selectedUniverseId, groupId: "move", delayMonths: 4, name: "Complete", salaryMode: "delta", salaryValue: 15000, salaryMonth: 1 }).output as any;
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Calculated." }).final!;
    expect(command.events.find(e => e.kind === "salary")?.salary?.value).toBe(15000);
  });
  it("preserves the model's explicit reality-origin revision choice through preview and finish", () => {
    const ctx = context();
    const original = structuredClone(ctx.universes[0]);
    ctx.universes[0].events = ctx.universes[0].events.map(e => ({ ...e, groupId: "move" }));
    const session = createToolSession(ctx);
    const selected = session.execute("select_action", { action: "create_alternative_from_reality", scenarioKind: "move", timelineId: original.id }).output as any;
    expect(selected.branchOrigin).toBe("current");
    const preview = session.execute("preview_plan_revision", { timelineId: original.id, groupId: "move", delayMonths: 4, salaryMode: "delta", salaryValue: 15000, salaryMonth: 1, name: "Seattle alternative" }).output as any;
    expect(preview.branchOrigin).toBe("current");
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Previewed." }).final!;
    expect(command.branchOrigin).toBe("current");
    expect(command.targetUniverseId).toBe(original.id);
    expect(command.events.filter(e => e.groupId === "move").map(e => e.month)).toEqual([9,9,9]);
    expect(ctx.universes[0].events.map(e => e.month)).toEqual([5,5,5]);
  });
  it("does not silently repair a model-selected child into a reality-origin alternative", () => {
    const ctx = context();
    const session = createToolSession(ctx);
    session.execute("select_action", { action: "create_child_timeline", scenarioKind: "general", timelineId: ctx.selectedUniverseId });
    const preview = session.execute("simulate_scenario", scenario).output as any;
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "A continuation." }).final!;
    expect(command.branchOrigin).toBeUndefined();
    expect(command.targetUniverseId).toBe(ctx.selectedUniverseId);
  });
  it("starts a standalone China alternative from baseline even with New York selected", () => {
    const ctx = context();
    ctx.prompt = "Can I move to China?";
    const session = createToolSession(ctx);
    const selection = session.execute("select_action", { action: "create_independent_timeline" }).output as any;
    expect(selection.selectedTimelineId).toBeUndefined();
    expect(selection.timeline).toBeNull();
    const preview = session.execute("simulate_scenario", {
      operation: "create", name: "Move to China", description: "An alternative move from baseline.",
      events: [{ kind: "rent", month: 5, amount: 1000, label: "China rent estimate", estimated: true }],
      assumptions: ["Estimated monthly rent in USD"],
    }).output as any;
    const result = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Independent move." }).final!;
    expect(result.operation).toBe("create");
    expect(result.targetUniverseId).toBeUndefined();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].label).toBe("China rent estimate");
  });
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
