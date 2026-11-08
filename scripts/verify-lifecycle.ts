import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { writeFile, mkdir } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { upgradeWorkspace } from "../src/workspace-upgrade";
import { applyReality, mergeEvents, mergeAssumptions } from "../src/state";
import { assess, simulate } from "../src/engine";
import type { Message } from "../src/types";

let state = upgradeWorkspace(seed());
state.profile.assessmentDate = "2026-11-08";
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string,string>;
const history: Message[] = [];
let selectedUniverseId: string | undefined;
const results: unknown[] = [];
const prompts = [
  "Can I move to New York? Estimate $2,800 monthly rent, $4,500 moving cost and $350 extra monthly living costs. Move in January 2027.",
  "What if I got a raise of $20,000 annually and waited 3 months before moving? Preserve the original and create a connected alternative.",
  "I got a raise of $40,000 annually. This is real, effective now.",
  "I've moved to New York now. The delayed New York version is the one that happened. Use its established move estimates provisionally, keeping my actual salary.",
  "What if I bought a $250,000 boat next month with $10,000 down, financing the rest at 12% APR for 120 months, and $1,500 monthly running costs? Start this independent possibility from my actual life.",
];
await mkdir("logs", { recursive: true });
for (const [i,prompt] of prompts.entries()) {
  const operationId = `live-lifecycle-${Date.now()}-${i+1}`;
  console.log(`Turn ${i+1}: requesting Nemotron (${operationId})`);
  try {
    const result = await runNemotronAgent({ prompt, mode: "create", profile: state.profile, universes: state.universes, selectedUniverseId, activeGoalId: state.activeGoalId, history, operationId }, env);
    const data = result.data;
    if (data.clarification || data.answer) {
      results.push({ turn: i+1, operationId, ...result });
      console.log(`Turn ${i+1}: ${data.clarification ?? data.answer}`);
      process.exitCode = 1;
      break;
    }
    if (data.operation === "reality") {
      state = applyReality(state, data, prompt).state;
      selectedUniverseId = undefined;
      if (data.reality?.move) state.activeGoalId = undefined;
    } else {
      const base = data.operation === "create" ? undefined : state.universes.find(u => u.id === data.targetUniverseId);
      const next = makeUniverse(data.name, data.description, mergeEvents(base?.events ?? [], data.events, data.removeEventIds, data.explicitOperations));
      next.assumptions = mergeAssumptions(base?.assumptions ?? [], data);
      if (base) { next.revisionOfId = base.id; if (data.branchOrigin !== "current") next.parentId = base.id; }
      state.universes.push(next); selectedUniverseId = next.id; state.activeGoalId = next.id;
    }
    if (i === 0) { assert.equal(assess(state.profile, state.universes[0]).viable, false); assert.equal(state.universes[0].events.find(e => e.kind === "rent")?.month, 2); }
    if (i === 1) { assert.equal(state.universes[1].parentId, undefined); assert.equal(state.universes[1].revisionOfId, state.universes[0].id); assert.equal(state.universes[1].events.filter(e => e.kind === "rent").length, 1); assert.equal(state.universes[1].events.find(e => e.kind === "rent")?.month, 5); }
    if (i === 2) { assert.equal(state.profile.annualSalary, 112000); assert.equal(state.universes[1].events.find(e => e.salary)?.salary?.status, "fulfilled"); }
    if (i === 3) { assert.equal(state.profile.location, "New York"); assert.equal(state.profile.annualSalary, 112000); assert.equal(state.universes.filter(u => u.archiveReason === "realized").length, 1); assert.equal(state.universes[1].archiveReason, "realized"); assert.equal(state.universes[0].archived, undefined); }
    if (i === 4) { assert.equal(state.universes[2].parentId, undefined); assert.equal(state.universes[2].events.some(e => e.kind === "financed-purchase"), true); assert(simulate(state.profile, state.universes[2].events)[36].debt > 190000); }
    history.push({ id: operationId + "u", role: "user", text: prompt }, { id: operationId + "a", role: "assistant", text: data.explanation ?? "Applied" });
    results.push({ turn: i+1, operationId, result, profile: state.profile, universes: state.universes, assessments: state.universes.map(u => ({ id: u.id, name: u.name, archived: u.archived, viable: assess(state.profile,u).viable })), baseline: simulate(state.profile)[0] });
    console.log(`Turn ${i+1}: ${data.operation}; ${state.universes.length} plans; location ${state.profile.location}; salary ${state.profile.annualSalary}`);
  } catch (error) {
    results.push({ turn: i+1, operationId, error: error instanceof Error ? error.message : String(error) });
    console.log(`Turn ${i+1}: failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1; break;
  } finally {
    await writeFile("logs/lifecycle-smoke.json", JSON.stringify(results, null, 2));
  }
}
console.log("Evidence: logs/lifecycle-smoke.json; raw provider responses: logs/nemotron.jsonl");
