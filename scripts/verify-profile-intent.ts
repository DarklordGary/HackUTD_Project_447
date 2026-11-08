import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { runNemotronAgent } from "../server/agent";
import { seedExamples } from "../src/seed-fixtures.test-support";
import { applyReality } from "../src/state";
import { currentFacts, simulate } from "../src/engine";

const env = { ...loadEnv("development", process.cwd(), ""), ...process.env } as Record<string, string>;
const state = seedExamples();
state.profile.assessmentDate = "2026-11-08";
state.activeGoalId = state.universes[0].id;
for (const prompt of [
  "i have 0 in liquid assets",
  "My salary is 0 now, my bills and subscriptions are $200 a month, and variable spending is $75 a month.",
  "My savings APR is 4%, my investments are $500, and I contribute $0 per month.",
]) {
  console.log(`Checking: ${prompt}`);
  const result = await runNemotronAgent({ prompt, mode: "branch", profile: state.profile, universes: state.universes,
    selectedUniverseId: state.activeGoalId, activeGoalId: state.activeGoalId,
    history: [{ id: "previous", role: "user", text: "What if I moved to New York?" }],
    operationId: crypto.randomUUID(),
  }, env);
  assert.equal(result.data.operation, "reality", JSON.stringify(result.data));
  assert(!result.data.clarification && !result.data.answer, "Expected an applied profile update");
  const updated = applyReality(state, result.data, prompt).state;
  assert.equal(updated.universes.length, state.universes.length);
  if (prompt.includes("liquid")) assert.equal(simulate(updated.profile)[0].liquid, 0);
  if (prompt.includes("salary")) {
    assert.equal(currentFacts(updated.profile).annualSalary, 0);
    assert.equal(currentFacts(updated.profile).recurring, 200);
    assert.equal(currentFacts(updated.profile).variable, 75);
  }
  if (prompt.includes("APR")) {
    assert.equal(updated.profile.savingsRate, .04);
    assert.equal(updated.profile.investments, 500);
    assert.equal(updated.profile.contribution, 0);
  }
  console.log(`PASS: ${JSON.stringify(result.data.reality)}`);
}
