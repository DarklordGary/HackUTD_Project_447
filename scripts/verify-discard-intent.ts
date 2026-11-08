import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { applyArchive } from "../src/state";
import { upgradeWorkspace } from "../src/workspace-upgrade";
import type { Message } from "../src/types";

const state = upgradeWorkspace(seed());
state.profile.annualSalary = 80000;
state.profile.location = "Seattle, WA";
state.profile.assessmentDate = "2026-11-08";
const seattle = makeUniverse("Seattle alternative", "A remaining possibility", []);
const boat = makeUniverse("fishing boat", "Cash boat possibility", [{ id: "boat-price", kind: "expense", month: 1, amount: 12000, estimated: false, label: "Boat purchase" }]);
state.universes = [seattle, boat]; state.activeGoalId = boat.id;
const before = structuredClone(state);
const history: Message[] = [
  { id: "1u", role: "user", text: "My salary actually went up by $8,000 a year." },
  { id: "1a", role: "assistant", text: "Your actual salary is now $80,000." },
  { id: "2u", role: "user", text: "Could I buy a $12,000 fishing boat outright?" },
  { id: "2a", role: "assistant", text: "I created the fishing boat possibility using a cash purchase." },
  { id: "3a", role: "assistant", text: "Please specify the salary change semantics: delta, absolute salary or percentage increase?" },
];
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string,string>;
const results: unknown[] = [];
await mkdir("logs", { recursive: true });
for (const [index, fixture] of [
  { prompt: "forget the boat", activeGoalId: boat.id },
  { prompt: "forget the boat", activeGoalId: seattle.id },
  { prompt: "Scrap that fishing boat idea. I'm not considering it anymore.", activeGoalId: boat.id },
].entries()) {
  const operationId = `discard-intent-${Date.now()}-${index+1}`;
  console.log(`Checking ${operationId}: ${fixture.prompt}`);
  try {
    const result = await runNemotronAgent({ prompt: fixture.prompt, mode: "branch", profile: state.profile, universes: state.universes,
      selectedUniverseId: fixture.activeGoalId, activeGoalId: fixture.activeGoalId, history, operationId }, env);
    results.push({ operationId, ...fixture, result });
    assert.equal(result.data.operation, "archive");
    assert.equal(result.data.targetUniverseId, boat.id);
    assert.equal(result.data.reality, undefined);
    const updated = applyArchive({ ...state, activeGoalId: fixture.activeGoalId }, result.data).state;
    assert.deepEqual(updated.profile, before.profile);
    assert.equal(updated.universes.find(u => u.id === boat.id)?.archiveReason, "manual");
    assert.deepEqual(updated.universes.find(u => u.id === seattle.id), seattle);
    assert.equal(updated.universes.length, 2);
    console.log("PASS: only boat plan archived; actual finances unchanged");
  } catch (error) {
    results.push({ operationId, error: error instanceof Error ? error.message : String(error) });
    console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
  } finally { await writeFile("logs/discard-intent-smoke.json", JSON.stringify(results, null, 2)); }
}
