import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { runNemotronAgent } from "../server/agent";
import { seed, makeUniverse } from "../src/seed";
import { mergeEvents } from "../src/state";
import type { Message } from "../src/types";

const profile = { ...seed().profile, assessmentDate: "2026-11-08" };
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string, string>;
const evidence: unknown[] = [];
const first = await runNemotronAgent({ prompt: "move to ny", mode: "create", profile, universes: [], history: [], operationId: `relocation-first-${Date.now()}` }, env);
assert.equal(first.data.operation, "create");
const ny = makeUniverse(first.data.name, first.data.description, mergeEvents([], first.data.events));
ny.assumptions = first.data.assumptions;
const original = structuredClone(ny);
const anchor = ny.events.find(e => e.kind === "rent")!;
assert.match(anchor.destination!, /New York|NYC/i);
const history: Message[] = [{ id: "ny-u", role: "user", text: "move to ny" }, { id: "ny-a", role: "assistant", text: first.data.explanation! }];
// Reproduce the old bad state as well: its name mentions NY, but its events only contain Denver.
const oldDenver = makeUniverse("NYC to Denver Move", "Old independent Denver proposal", [
  { id: "old-denver", kind: "rent", label: "Denver rent", month: 2, amount: 1800, estimated: true, groupId: "denver", destination: "Denver, CO" },
]);
const cases = [
  { prompt: "after ny move to denver" },
  { prompt: "and after moving there can i move to denver" },
  { prompt: "ny", clarification: true },
  { prompt: "ny", clarification: true, marked: true },
  { prompt: "can i move from ny to denver" },
  { prompt: "move to Denver 2 years after I move to NY", months: 24 },
  { prompt: "how about 2 years after i move to ny", months: 24, oldState: true },
  { prompt: "Can I move to Chicago?", independent: true },
];
await mkdir("logs", { recursive: true });
evidence.push({ prompt: "move to ny", result: first });
for (const fixture of cases) {
  console.log(`Checking: ${fixture.prompt}`);
  try {
    const result = await runNemotronAgent({ prompt: fixture.prompt, mode: "create", profile,
      universes: fixture.oldState ? [ny, oldDenver] : [ny], selectedUniverseId: fixture.oldState ? oldDenver.id : ny.id,
      activeGoalId: fixture.oldState ? oldDenver.id : ny.id,
      history: fixture.clarification ? [...history,
        { id: "pending-u", role: "user", text: "and after moving there can i move to denver" },
        { id: "pending-a", role: "assistant", text: "Which departure city are you referring to—New York (NY) or another location? Please specify the exact city name (e.g., ny, new york, nyc) so I can correctly create the next timeline.", ...(fixture.marked ? { clarificationFor: "and after moving there can i move to denver" } : {}) },
      ] : fixture.oldState ? [...history, { id: "denver-u", role: "user", text: "can i move from ny to denver" }, { id: "denver-a", role: "assistant", text: "Created NYC to Denver Move with Denver rent starting January 2027." }] : history,
      operationId: `relocation-followup-${Date.now()}`,
    }, env);
    evidence.push({ ...fixture, result });
    assert.equal(result.data.operation, fixture.independent ? "create" : "branch");
    if (!fixture.independent) {
      assert.equal(result.data.targetUniverseId, ny.id);
      assert.equal(result.data.branchOrigin, undefined);
      assert(result.tools.some(t => t.tool === "preview_followup_move" && t.status === "ok"));
      assert.equal(result.data.events.length, 3);
      assert(result.data.events.every(e => /Denver/i.test(e.destination ?? "") && e.month > anchor.month));
      if (fixture.months) assert(result.data.events.every(e => e.month === anchor.month + fixture.months!));
      const events = mergeEvents(ny.events, result.data.events, result.data.removeEventIds, true);
      assert.deepEqual(events.slice(0, ny.events.length), original.events);
    }
    assert.deepEqual(ny, original);
    console.log("PASS");
  } catch (error) {
    evidence.push({ ...fixture, error: String(error) }); process.exitCode = 1; console.error(String(error));
  } finally { await writeFile("logs/relocation-intent-smoke.json", JSON.stringify(evidence, null, 2)); }
}
