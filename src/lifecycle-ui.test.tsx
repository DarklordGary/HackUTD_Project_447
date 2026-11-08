// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { STORAGE_KEY } from "./state";
import { createToolSession } from "../server/agent";
import { assess } from "./engine";
import type { AppState } from "./types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("drives five composer turns, restores context, realizes one plan and starts an independent boat", async () => {
  localStorage.clear(); vi.stubEnv("VITE_SPACETIMEDB_DATABASE", "");
  Element.prototype.scrollIntoView = vi.fn();
  let turn = 0;
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/status") return { ok: true, json: async () => ({ ai: "Nemotron" }) };
    const body = JSON.parse(options!.body as string); requests.push(body);
    const session = createToolSession({ ...body, selectedUniverseId: body.universe?.id });
    let tool = "simulate_scenario", args: any;
    if (turn === 0) {
      session.execute("select_action", { action: "create_independent_timeline" });
      args = { operation: "create", name: "Original NYC", description: "NYC estimates", assumptions: [], events: [
        { kind: "expense", label: "Moving costs", amount: 4500, month: 2, estimated: true, groupId: "nyc", destination: "New York" },
        { kind: "rent", label: "NYC rent", amount: 2800, month: 2, estimated: true, groupId: "nyc", destination: "New York" },
        { kind: "monthly-expense", label: "Local expenses", amount: 350, month: 2, estimated: true, groupId: "nyc", destination: "New York" },
      ] };
    } else if (turn === 1) {
      session.execute("select_action", { action: "create_alternative_from_reality", timelineId: body.activeGoalId });
      args = { operation: "branch", timelineId: body.activeGoalId, name: "Delayed NYC", description: "Raise and delay", assumptions: [], reschedule: { groupId: "nyc", delayMonths: 3 }, events: [
        { kind: "salary", label: "Raise prerequisite", amount: 0, month: 1, estimated: false, salary: { mode: "delta", value: 20000, baseline: 72000, purpose: "prerequisite" } },
      ] };
    } else if (turn === 2 || turn === 3) {
      session.execute("select_action", { action: "update_real_life" }); tool = "preview_reality_update";
      args = turn === 2 ? { changes: { salaryChange: { mode: "delta", value: 40000, baseline: 72000, purpose: "prerequisite" } } }
        : { changes: { move: { timelineId: body.activeGoalId, groupId: "nyc", location: "New York" } } };
    } else {
      session.execute("select_action", { action: "create_independent_timeline" });
      args = { operation: "create", name: "Boat", description: "Cash boat, asset excluded", assumptions: [], events: [{ kind: "expense", label: "Boat", amount: 500, month: 1, estimated: false }] };
    }
    const preview = session.execute(tool, args).output as any;
    const data = session.execute("apply_preview", { previewId: preview.previewId, explanation: `Calculated turn ${turn + 1}.` }).final;
    turn++; return { ok: true, json: async () => ({ source: "Nemotron", tools: [], data }) };
  }));
  let view = render(<App />);
  const state = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
  const send = async (text: string, expectedTurn: number) => {
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(state().conversation?.length).toBe(expectedTurn * 2));
  };
  expect(state().universes).toHaveLength(0);
  await send("Can I move to New York?", 1);
  expect(assess(state().profile, state().universes[0]).viable).toBe(false);
  const original = structuredClone(state().universes[0]);
  await send("What if I got a raise of $20,000 and waited 3 months before moving?", 2);
  expect(state().universes[0]).toEqual(original);
  expect(state().universes[1].parentId).toBeUndefined();
  expect(state().universes[1].revisionOfId).toBe(original.id);
  expect(state().universes[1].events.filter(e => e.groupId === "nyc").map(e => e.month)).toEqual([5,5,5]);
  const childId = state().universes[1].id;
  view.unmount(); view = render(<App />);
  await send("I got a raise of $40,000.", 3);
  expect(requests[2].activeGoalId).toBe(childId);
  expect(state().profile.annualSalary).toBe(112000);
  expect(state().universes[1].events.find(e => e.kind === "salary")?.salary?.status).toBe("fulfilled");
  await send("I've moved to New York. The delayed version happened.", 4);
  expect(state().universes.filter(u => u.archived).map(u => u.id)).toEqual([childId]);
  expect(state().profile.location).toBe("New York");
  expect(screen.getByText(/New York is now reality/)).toBeTruthy();
  await send("What if I bought a $500 boat with cash?", 5);
  expect(requests[4].universe).toBeUndefined();
  expect(state().universes[2].parentId).toBeUndefined();
  expect(state().universes[2].events).toHaveLength(1);
  expect(state().profile.annualSalary).toBe(112000);
  view.unmount(); render(<App />);
  expect(state().universes[1].archiveReason).toBe("realized");
  expect(state().appliedOperationIds).toHaveLength(5);
});


it("keeps a liquid-assets life update in the conversation and persists it without a new plan", async () => {
  localStorage.clear(); vi.stubEnv("VITE_SPACETIMEDB_DATABASE", "");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/status") return { ok: true, json: async () => ({ ai: "Nemotron" }) };
    const body = JSON.parse(options!.body as string);
    const session = createToolSession({ ...body, selectedUniverseId: body.universe?.id });
    session.execute("select_action", { action: "update_real_life", reportedAs: "actual", requestedChanges: ["profile"] });
    const preview = session.execute("preview_reality_update", { changes: { liquidAssets: 0 } }).output as any;
    const data = session.execute("apply_preview", { previewId: preview.previewId, explanation: "Cash corrected." }).final;
    return { ok: true, json: async () => ({ source: "Nemotron", tools: [], data }) };
  }));
  const view = render(<App />);
  fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "i have 0 in liquid assets" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  const state = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
  await waitFor(() => expect(state().changes).toHaveLength(1));
  expect(state().profile).toMatchObject({ checking: 0, savings: 0 });
  expect(state().universes).toHaveLength(0);
  expect(state().conversation).toHaveLength(2);
  expect(state().conversation?.[0].text).toBe("i have 0 in liquid assets");
  view.unmount(); render(<App />);
  expect(state().profile).toMatchObject({ checking: 0, savings: 0 });
  expect(state().universes).toHaveLength(0);
  expect(state().conversation).toHaveLength(2);
});
