import { describe, expect, it } from "vitest";
import { seed, makeUniverse } from "./seed";
import { upgradeWorkspace } from "./workspace-upgrade";

describe("Main Reality reset", () => {
  it("clears saved branches and their notices while retaining baseline finances and history", () => {
    const original = seed();
    original.examplesVersion = 1;
    const next = upgradeWorkspace(original);
    expect(next.universes).toEqual([]);
    expect(next.notices).toEqual([]);
    expect(next.profile).toBe(original.profile);
    expect(next.changes).toBe(original.changes);
    expect(original.universes).toHaveLength(3);
  });

  it("starts fresh workspaces without examples and preserves branches created after reset", () => {
    const next = upgradeWorkspace(seed());
    expect(next.universes).toEqual([]);
    next.universes.push(makeUniverse("New future", "Created after resetting", []));
    expect(upgradeWorkspace(next)).toBe(next);
    expect(next.universes).toHaveLength(1);
  });
});
