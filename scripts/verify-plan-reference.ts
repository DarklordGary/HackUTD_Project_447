import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { applyArchive } from "../src/state";

const profile = { ...seed().profile, assessmentDate: "2026-11-08" };
const seattle = makeUniverse("Seattle Move", "Move to Seattle", []);
const denver = makeUniverse("Denver Move", "Move to Denver", []);
const connection = { ...makeUniverse("Seattle → Denver Move", "Move to Denver after Seattle", []), parentId: seattle.id, revisionOfId: seattle.id };
const universes = [seattle, denver, connection];
const original = structuredClone(universes);
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string,string>;
const results: unknown[] = [];
await mkdir("logs", { recursive: true });
for (const [index, fixture] of [
  { prompt: "forget about denver", activeGoalId: undefined, expected: undefined },
  { prompt: "forget about denver", activeGoalId: seattle.id, expected: undefined },
  { prompt: "Forget Denver Move, the standalone plan.", activeGoalId: seattle.id, expected: denver.id },
  { prompt: "Forget Seattle → Denver Move.", activeGoalId: seattle.id, expected: connection.id },
].entries()) {
  const operationId = `plan-reference-${Date.now()}-${index+1}`;
  console.log(`Checking ${operationId}: ${fixture.prompt}`);
  try {
    const result = await runNemotronAgent({ prompt: fixture.prompt, mode: "create", profile, universes, history: [], activeGoalId: fixture.activeGoalId, selectedUniverseId: fixture.activeGoalId, operationId }, env);
    results.push({ operationId, ...fixture, result });
    if (!fixture.expected) {
      assert(result.data.clarification, "Ambiguous Denver must ask which plan");
      assert(result.data.clarification.includes("Denver Move"));
      assert(result.data.clarification.includes("Seattle → Denver Move"));
      assert.equal(result.data.operation, undefined);
      assert(!result.tools.some(t => t.tool === "apply_preview"));
      console.log(`PASS: ${result.data.clarification}`);
    } else {
      assert.equal(result.data.operation, "archive");
      assert.equal(result.data.targetUniverseId, fixture.expected);
      const before = { version: 1 as const, profile, universes, notices: [], changes: [] };
      const after = applyArchive(before, result.data).state;
      assert.equal(after.universes.filter(u => u.archived).length, 1);
      assert.equal(after.universes.find(u => u.archived)?.id, fixture.expected);
      assert.deepEqual(after.profile, profile);
      console.log("PASS: exact named plan archived");
    }
    assert.deepEqual(universes, original);
  } catch (error) { results.push({ operationId, error: error instanceof Error ? error.message : String(error) }); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  finally { await writeFile("logs/plan-reference-smoke.json", JSON.stringify(results, null, 2)); }
}
