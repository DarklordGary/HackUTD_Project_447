import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { upgradeWorkspace } from "../src/workspace-upgrade";
import { applyReality, mergeEvents, mergeAssumptions } from "../src/state";
import { currentFacts } from "../src/engine";
import type { AppState, Message } from "../src/types";

const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string,string>;
let state = upgradeWorkspace(seed());
state.profile.assessmentDate = "2026-11-08";
const history: Message[] = [];
const results: unknown[] = [];
await mkdir("logs", { recursive: true });
async function ask(prompt: string, workspace: AppState, conversation: Message[]) {
  const operationId = `reality-intent-${Date.now()}`;
  console.log(`Checking ${operationId}: ${prompt}`);
  const result = await runNemotronAgent({ prompt, mode: "branch", profile: workspace.profile, universes: workspace.universes,
    selectedUniverseId: workspace.activeGoalId, activeGoalId: workspace.activeGoalId, history: conversation, operationId }, env);
  results.push({ operationId, prompt, result });
  await writeFile("logs/reality-intent-smoke.json", JSON.stringify(results, null, 2));
  return result.data;
}
try {
  const prompts = ["Could I afford to relocate to Seattle early next year?", "What if I earned another $15,000 a year and pushed the move back four months?", "My salary actually went up by $8,000 a year."];
  let beforeReality: AppState | undefined;
  for (const [index,prompt] of prompts.entries()) {
    const data = await ask(prompt, state, history);
    assert(!data.answer && !data.clarification, "Expected a calculated command, not an answer or clarification");
    if (index === 2) {
      beforeReality = structuredClone(state);
      assert.equal(data.operation, "reality", "The actual raise must not create a branch");
      const result = applyReality(state, data, prompt);
      state = result.state;
      assert.equal(state.universes.length, 2);
      assert.equal(currentFacts(state.profile).annualSalary, 80000);
      assert.equal(state.changes.length, 1);
      assert.deepEqual(state.universes.map(u => u.events.filter(e => e.kind !== "salary")), beforeReality.universes.map(u => u.events.filter(e => e.kind !== "salary")));
      assert.equal(state.universes[1].events.find(e => e.salary)?.salary?.value, 15000);
      assert.equal(state.universes[1].events.find(e => e.salary)?.salary?.status, "pending");
    } else {
      assert.equal(data.operation, index === 0 ? "create" : "branch");
      if (index === 1) { assert.equal(data.branchOrigin, "current"); assert.equal(data.events.find(e => e.kind === "salary")?.salary?.value, 15000); assert.equal(data.events.find(e => e.kind === "salary")?.salary?.mode, "delta"); }
      const base = index ? state.universes[0] : undefined;
      const next = makeUniverse(data.name, data.description, mergeEvents(base?.events ?? [], data.events, data.removeEventIds, true));
      next.assumptions = mergeAssumptions(base?.assumptions ?? [], data);
      if (base) { next.revisionOfId = base.id; if (data.branchOrigin !== "current") next.parentId = base.id; }
      state.universes.push(next); state.activeGoalId = next.id;
      assert.equal(currentFacts(state.profile).annualSalary, 72000);
      if (index === 1) assert.equal(next.events.find(e => e.kind === "rent")!.month, base!.events.find(e => e.kind === "rent")!.month + 4);
    }
    history.push({ id: `${index}u`, role: "user", text: prompt }, { id: `${index}a`, role: "assistant", text: data.explanation ?? "Applied" });
    console.log(`PASS: ${data.operation}; ${state.universes.length} plans; actual salary ${currentFacts(state.profile).annualSalary}`);
  }
  for (const [prompt, conversation] of [
    ["My salary actually went up by $8,000 a year.", []],
    ["The raise came through—I'm earning $8,000 more per year now.", history.slice(0,4)],
  ] as [string, Message[]][]) {
    const data = await ask(prompt, beforeReality!, conversation);
    assert.equal(data.operation, "reality");
    const updated = applyReality(beforeReality!, data, prompt).state;
    assert.equal(updated.universes.length, 2); assert.equal(currentFacts(updated.profile).annualSalary, 80000);
    console.log("PASS: actual update with and without conversation history");
  }
  const hypothetical = await ask("What if my salary went up by $8,000 a year instead?", beforeReality!, history.slice(0,4));
  assert(["branch", "modify", "create"].includes(hypothetical.operation ?? ""));
  assert.equal(hypothetical.reality, undefined);
  console.log("PASS: hypothetical contrast remains hypothetical");
} catch (error) {
  results.push({ error: error instanceof Error ? error.message : String(error) });
  await writeFile("logs/reality-intent-smoke.json", JSON.stringify(results, null, 2));
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
