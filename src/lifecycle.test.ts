import { describe, expect, it, vi } from "vitest";
import { makeUniverse } from "./seed";
import { seedExamples as seed } from "./seed-fixtures.test-support";
import { applyReality, rescheduleGroup } from "./state";
import { assess, simulate, salaryTarget, loanPayment } from "./engine";
import { upgradeWorkspace } from "./workspace-upgrade";
import { workspaceSchema } from "./contracts";
import type { FinancialEvent } from "./types";
import { createToolSession, runNemotronAgent } from "../server/agent";

export function journeyFixture() {
  const state = upgradeWorkspace(seed());
  state.profile.assessmentDate = "2026-11-08";
  const events: FinancialEvent[] = [
    { id: "move", kind: "expense", label: "Move estimate", month: 2, amount: 4500, estimated: true, groupId: "nyc", destination: "New York" },
    { id: "rent", kind: "rent", label: "NYC rent", month: 2, amount: 2800, estimated: true, groupId: "nyc", destination: "New York" },
    { id: "local", kind: "monthly-expense", label: "Local costs", month: 2, amount: 350, estimated: true, groupId: "nyc", destination: "New York" },
  ];
  const original = makeUniverse("Original New York", "Move to NYC", events);
  const child = { ...makeUniverse("Delayed New York", "Raise and wait", [
    ...rescheduleGroup(events, "nyc", 3),
    { id: "raise", kind: "salary" as const, label: "Required raise", month: 1, amount: 0, estimated: false,
      salary: { mode: "delta" as const, value: 20000, baseline: 72000, purpose: "prerequisite" as const } },
  ]), parentId: original.id };
  return { state, original, child };
}
const blank = { name: "Reality", description: "", events: [], assumptions: [] };

describe("conversational lifecycle", () => {
  it("runs all five state transitions with actual Y, exact-once realization and independent boat financing", () => {
    const { state, original, child } = journeyFixture();
    expect(state.universes).toHaveLength(0);
    state.universes.push(original);
    expect(assess(state.profile, original).viable).toBe(false);
    expect(assess(state.profile, original).firstShortfall?.month).toBeGreaterThan(0);
    const preserved = structuredClone(original);
    state.universes.push(child);
    expect(assess(state.profile, child).viable).toBe(true);
    expect(original).toEqual(preserved);
    const raised = applyReality(state, { ...blank, operationId: "raise-Y", reality: { salaryChange: { mode: "delta", value: 40000, baseline: 72000, purpose: "prerequisite" } } }, "I got a raise of $40,000.");
    expect(raised.state.profile.annualSalary).toBe(112000);
    expect(raised.impacts.find(i => i.id === original.id)).toMatchObject({ beforeViable: false, afterViable: true });
    expect(raised.state.universes[1].events.at(-1)?.salary?.status).toBe("fulfilled");
    expect(simulate(raised.state.profile, raised.state.universes[1].events)[1].income).toBe(7093.33);
    const command = { ...blank, operationId: "realized-NYC", reality: { move: { timelineId: child.id, groupId: "nyc", location: "New York" } } };
    const moved = applyReality(raised.state, command, "I've moved to New York.");
    expect(moved.state.profile.location).toBe("New York");
    expect(moved.state.profile.annualSalary).toBe(112000);
    expect(moved.state.profile.actualEvents?.[0].effectiveDate).toBe("2026-11-08");
    expect(moved.state.universes.filter(u => u.archived)).toHaveLength(1);
    expect(moved.state.universes[1]).toMatchObject({ archiveReason: "realized", realityChangeId: "realized-NYC" });
    expect(moved.state.universes[0].events.every(e => e.fulfilledBy === "realized-NYC")).toBe(true);
    expect(moved.explanation).toContain("provisional estimate");
    expect(simulate(moved.state.profile)[0].liquid).toBe(18500);
    expect(simulate(moved.state.profile)[1].expenses).toBe(4430);
    expect(applyReality(moved.state, command, "retry").state).toBe(moved.state);
    const restored = workspaceSchema.parse(JSON.parse(JSON.stringify(moved.state)));
    expect(applyReality(restored, command, "retry").state).toBe(restored);
    const boat: FinancialEvent = { id: "boat", kind: "financed-purchase", label: "Boat (asset value excluded)", month: 1, amount: 250000, estimated: false,
      financing: { downPayment: 10000, apr: .12, termMonths: 120, runningCosts: 1500 } };
    const rows = simulate(restored.profile, [boat]);
    expect(rows[0].liquid).toBe(18500);
    expect(rows[1].income).toBe(7093.33);
    expect(rows[1].debt).toBeGreaterThan(250000);
    expect(rows[1].netCashFlow).toBeLessThan(0);
    expect(rows[36].debt).toBeGreaterThan(190000);
    expect(rows[36].liquid).toBeLessThan(0);
    expect(assess(restored.profile, makeUniverse("Small boat", "Cash, asset excluded", [{ id: "cheap", kind: "expense", label: "Boat", month: 1, amount: 500, estimated: false }])).viable).toBe(true);
  });
  it.each([0, 1000, 10000, 20000, 40000])("reconciles Y=%s without stacking the prerequisite", value => {
    const { state, original, child } = journeyFixture(); state.universes = [original, child];
    const result = applyReality(state, { ...blank, reality: { salaryChange: { mode: "delta", value, baseline: 72000, purpose: "prerequisite" } } }, "actual raise");
    const salary = result.state.universes[1].events.at(-1)!.salary!;
    expect(salary.status).toBe(value >= 20000 ? "fulfilled" : "pending");
    expect(simulate(result.state.profile, result.state.universes[1].events)[1].income).toBeCloseTo(Math.max(72000 + value, 92000) * .76 / 12, 2);
    if (value <= 1000) expect(assess(result.state.profile, result.state.universes[0]).viable).toBe(false);
  });
  it("reschedules offsets, preserves IDs/unrelated events and rejects horizon overflow", () => {
    const { original } = journeyFixture();
    original.events.push({ ...original.events[0], id: "refund", kind: "income", month: 3 });
    const later = { ...original.events[1], id: "chicago", groupId: "chicago", destination: "Chicago", month: 12 };
    const result = rescheduleGroup([...original.events, later], "nyc", 3);
    expect(result.map(e => e.month)).toEqual([5,5,5,6,12]);
    expect(result.map(e => e.id)).toEqual(["move", "rent", "local", "refund", "chicago"]);
    expect(original.events[0].month).toBe(2);
    expect(() => rescheduleGroup(original.events, "nyc", 35)).toThrow(/horizon/);
  });
  it("keeps additional and counterfactual salaries, ignores archived alerts and preserves future purchases", () => {
    const { state, original, child } = journeyFixture();
    original.archived = true;
    child.events.push({ id: "car", kind: "expense", label: "Future car", month: 20, amount: 1000, estimated: false });
    child.events.push({ ...child.events[3], id: "extra", month: 8, salary: { ...child.events[3].salary!, purpose: "additional" } });
    child.events.push({ ...child.events[3], id: "counter", month: 10, salary: { mode: "absolute", value: 90000, baseline: 72000, purpose: "counterfactual" } });
    state.universes = [original, child];
    const result = applyReality(state, { ...blank, reality: { annualSalary: 112000 } }, "raise");
    expect(result.impacts).toHaveLength(1);
    expect(result.state.notices.every(n => n.universeId === child.id)).toBe(true);
    expect(result.state.universes[1].events.find(e => e.id === "car")).toBeTruthy();
    expect(result.impacts[0].assumptions.join(" ")).toContain("additional");
    expect(simulate(result.state.profile, result.state.universes[1].events)[8].income).toBe(8360);
    expect(simulate(result.state.profile, result.state.universes[1].events)[10].income).toBe(5700);
  });
  it("uses explicit salary bases and dates without advancing opening balances", () => {
    const { state } = journeyFixture();
    expect(salaryTarget({ mode: "percent", value: 10, baseline: 72000, purpose: "prerequisite" })).toBe(79200);
    const result = applyReality(state, { ...blank, reality: { effectiveDate: "2027-01-01", annualSalary: 90000 } }, "future salary");
    const rows = simulate(result.state.profile);
    expect(rows[0].liquid).toBe(23000);
    expect(rows[1].income).toBe(4560);
    expect(rows[2].income).toBe(5700);
    expect(() => applyReality(state, { ...blank, reality: { effectiveDate: "2026-10-01", annualSalary: 90000 } }, "past")).toThrow(/opening/);
  });
  it("previews realization read-only and gates finishing tools", () => {
    const { state, original } = journeyFixture(); state.universes = [original];
    const session = createToolSession({ prompt: "I've moved to New York", mode: "branch", profile: state.profile, universes: state.universes, history: [], operationId: "protocol" });
    expect(session.availableTools().map(t => t.function.name)).toEqual(["select_action"]);
    session.execute("select_action", { action: "update_real_life", timelineId: original.id });
    expect(session.availableTools().some(t => t.function.name === "apply_preview")).toBe(false);
    expect(() => session.execute("preview_reality_update", { changes: { move: { timelineId: "unknown", groupId: "nyc", location: "New York" } } })).toThrow();
    const preview = session.execute("preview_reality_update", { changes: { move: { timelineId: original.id, groupId: "nyc", location: "New York", rent: 2600, movingCost: 3500 } } }).output as any;
    expect(preview.realizedPlans).toEqual([{ id: original.id, name: original.name, archiveReason: "realized" }]);
    expect(original.archived).toBeUndefined();
    const command = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Move recorded with disclosed local estimate." }).final!;
    const result = applyReality(state, command, "move");
    expect(simulate(result.state.profile)[0].liquid).toBe(19500);
    expect(simulate(result.state.profile)[1].expenses).toBe(4230);
  });
  it("isolates the realization phase and rejects hallucinated applied financial summaries", async () => {
    const { state, original } = journeyFixture();
    const session = createToolSession({ prompt: "I've moved now", mode: "branch", profile: state.profile, universes: [original], history: [] });
    session.execute("select_action", { action: "realize_plan", timelineId: original.id });
    const names = session.availableTools().map(t => t.function.name);
    expect(names).toContain("preview_move_realization");
    expect(names).not.toContain("preview_salary_change");
    expect(names).not.toContain("preview_reality_update");
    const calls = [
      ["select_action", { action: "realize_plan", timelineId: original.id }],
      ["preview_move_realization", { timelineId: original.id, groupId: "nyc", location: "New York" }],
      ["apply_preview", { previewId: "reality-1", explanation: "You earn $70,933 monthly now; I also applied a second raise." }],
    ];
    const fetcher = vi.fn(async () => {
      const [name, args] = calls.shift()!;
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call-${calls.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const result = await runNemotronAgent({ prompt: "I've moved now", mode: "branch", profile: state.profile, universes: [original], history: [], operationId: "mock-realize" }, { NEMOTRON_LOG_PATH: ".spacetime/lifecycle-mock.jsonl" }, fetcher as typeof fetch);
    expect(result.data.explanation).toContain("New York is now reality");
    expect(result.data.explanation).not.toContain("70,933");
    expect(result.data.reality?.salaryChange).toBeUndefined();
    expect(applyReality({ ...state, universes: [original] }, result.data, "move").state.profile.annualSalary).toBe(72000);
  });
  it("migrates old archive metadata without deleting new user plans or history", () => {
    const { state, original, child } = journeyFixture(); original.archived = true;
    state.universes = [original, child];
    const migrated = upgradeWorkspace(state);
    expect(migrated.universes).toHaveLength(2);
    expect(migrated.universes[0].archiveReason).toBe("manual");
    expect(migrated.universes[0].finalProfile).toEqual(state.profile);
    expect(migrated.universes[1]).toBe(child);
    expect(upgradeWorkspace(migrated)).toBe(migrated);
  });
  it("resolves the durable goal, permits explicit alternatives and clarifies ambiguous versions", () => {
    const { state, original, child } = journeyFixture();
    const ctx = { prompt: "I've moved", mode: "create" as const, profile: state.profile, universes: [original, child], history: [] };
    const conversation = createToolSession({ ...ctx, activeGoalId: child.id });
    const selection = conversation.execute("select_action", { action: "realize_plan", timelineId: original.id }).output as any;
    expect(selection.selectedTimelineId).toBe(child.id);
    expect(() => conversation.execute("preview_move_realization", { timelineId: original.id, groupId: "nyc", location: "New York" })).toThrow(/resolved plan/);
    const explicit = createToolSession({ ...ctx, activeGoalId: child.id });
    expect((explicit.execute("select_action", { action: "realize_plan", referenceSource: "explicit_plan", timelineId: original.id }).output as any).selectedTimelineId).toBe(original.id);
    const ambiguous = createToolSession(ctx);
    ambiguous.execute("select_action", { action: "realize_plan", timelineId: original.id });
    expect(() => ambiguous.execute("preview_move_realization", { timelineId: original.id, groupId: "nyc", location: "New York" })).toThrow(/Ambiguous/);
  });
});

describe("financed purchases", () => {
  const base = () => ({ ...seed().profile, annualSalary: 0, taxRate: 0, rent: 0, recurring: 0, variable: 0, obligations: 0, contribution: 0, debts: [], savingsRate: 0 });
  const purchase = (apr = 0): FinancialEvent => ({ id: "loan", kind: "financed-purchase", label: "Boat, asset excluded", month: 1, amount: 1200, estimated: false, financing: { downPayment: 200, apr, termMonths: 10, runningCosts: 5 } });
  it("originates principal, debits only down payment, amortizes and stops payments at payoff", () => {
    const rows = simulate(base(), [purchase()]);
    expect(rows[1].debt).toBe(900);
    expect(rows[1].debtPayments).toBe(100);
    expect(rows[1].netCashFlow).toBe(-305);
    expect(rows[1].liquid).toBe(22695);
    expect(rows[10].debt).toBe(0);
    expect(rows[11].debtPayments).toBe(0);
    expect(rows[11].expenses).toBe(5);
  });
  it("rounds monthly interest and rejects insufficient payments and invalid down payments", () => {
    const event = purchase(.12), rows = simulate(base(), [event]);
    expect(loanPayment(1000, .12, 10)).toBe(105.58);
    expect(rows[1].debt).toBe(904.42);
    expect(rows[2].debt).toBe(807.88);
    expect(() => simulate(base(), [{ ...event, financing: { ...event.financing!, payment: 1 } }])).toThrow(/insufficient/);
    expect(() => simulate(base(), [{ ...event, financing: { ...event.financing!, downPayment: 1300 } }])).toThrow(/down payment/);
  });
  it("cash shortfall does not originate a loan", () => {
    const row = simulate(base(), [{ id: "cash", kind: "expense", label: "Cash boat", amount: 50000, month: 1, estimated: false }])[1];
    expect(row.checking).toBe(-27000); expect(row.debt).toBe(0);
  });
});
