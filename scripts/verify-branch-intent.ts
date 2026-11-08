import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { mergeEvents } from "../src/state";

const profile = { ...seed().profile, assessmentDate: "2026-11-08" };
const plan = makeUniverse("Seattle relocation", "Move in January 2027", [
  { id: "rent", kind: "rent", label: "Seattle rent", month: 2, amount: 2100, estimated: true, groupId: "seattle", destination: "Seattle, WA" },
  { id: "move", kind: "expense", label: "Seattle moving cost", month: 2, amount: 5000, estimated: true, groupId: "seattle", destination: "Seattle, WA" },
  { id: "local", kind: "monthly-expense", label: "Seattle living costs", month: 2, amount: 300, estimated: true, groupId: "seattle", destination: "Seattle, WA" },
]);
const original = structuredClone(plan);
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string,string>;
const prompts = [
  { prompt: "What if I earned another $15,000 a year and pushed the move back four months?", revision: true },
  { prompt: "Could I wait four more months to relocate to Seattle and get a $15,000 annual raise in the meantime? Keep the original option too.", revision: true },
  { prompt: "Two months after that January Seattle move, what if I took a job paying $95,000 annually?", revision: false },
];
const results: unknown[] = [];
await mkdir("logs", { recursive: true });
for (const [index, fixture] of prompts.entries()) {
  const operationId = `branch-intent-${Date.now()}-${index+1}`;
  console.log(`Checking ${operationId}: ${fixture.prompt}`);
  try {
    const result = await runNemotronAgent({ prompt: fixture.prompt, mode: "branch", profile, universes: [plan], selectedUniverseId: plan.id, activeGoalId: plan.id, operationId,
      history: [{ id: "request", role: "user", text: "Could I afford to relocate to Seattle early next year?" }, { id: "response", role: "assistant", text: "Seattle relocation explores moving in January 2027 with $2,100 rent, $5,000 moving costs and $300 additional monthly expenses." }],
    }, env);
    results.push({ operationId, ...fixture, result });
    assert.equal(result.data.operation, "branch");
    assert.equal(result.data.targetUniverseId, plan.id);
    const events = mergeEvents(plan.events, result.data.events, result.data.removeEventIds, true);
    if (fixture.revision) {
      assert.equal(result.data.branchOrigin, "current", "Model must choose a separate path from reality, not a child after the original move");
      assert.deepEqual(events.filter(e => e.groupId === "seattle").map(e => e.month), [6,6,6]);
      assert.equal(events.filter(e => e.kind === "rent").length, 1);
      assert.equal(events.find(e => e.kind === "salary")?.salary?.mode, "delta");
      assert.equal(events.find(e => e.kind === "salary")?.salary?.value, 15000);
    } else {
      assert.equal(result.data.branchOrigin, undefined, "Continuation must keep the original path as parent");
      assert.deepEqual(events.filter(e => e.groupId === "seattle"), original.events);
      assert.equal(events.find(e => e.kind === "salary")?.month, 4);
    }
    assert.deepEqual(plan, original);
    console.log(`PASS: model chose ${result.data.branchOrigin ?? "existing timeline"}`);
  } catch (error) {
    results.push({ operationId, error: error instanceof Error ? error.message : String(error) });
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally { await writeFile("logs/branch-intent-smoke.json", JSON.stringify(results, null, 2)); }
}
