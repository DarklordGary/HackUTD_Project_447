import { describe, expect, it } from "vitest";
import { layoutTimelines } from "./TimelineCanvas";
import { seedExamples as seed } from "./seed-fixtures.test-support";
describe("persistent timeline layout", () => {
  it("uses real parent IDs and event timing even when children arrive before parents", () => {
    const s = seed(),
      parent = s.universes[0];
    const child = {
      ...structuredClone(parent),
      id: "branch",
      parentId: parent.id,
      events: [
        ...parent.events,
        {
          id: "job",
          kind: "salary" as const,
          month: 12,
          amount: 90000,
          label: "New job",
          estimated: false,
        },
      ],
    };
    const nodes = layoutTimelines([child, ...s.universes]);
    const branch = nodes.find((n) => n.universe.id === child.id)!;
    expect(branch.parent?.universe.id).toBe(parent.id);
    expect(branch.fork).toBe(9);
    expect(new Set(nodes.map((n) => n.lane)).size).toBe(nodes.length);
    expect(nodes.find((n) => n.universe.id === parent.id)!.fork).toBe(2);
  });
  it("does not recurse indefinitely on a malformed parent cycle", () => {
    const [a, b] = seed().universes;
    a.parentId = b.id;
    b.parentId = a.id;
    const nodes = layoutTimelines([a, b]);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => Number.isFinite(n.fork))).toBe(true);
  });
});
