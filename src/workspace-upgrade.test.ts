import { describe, expect, it } from "vitest";
import { seed, makeUniverse } from "./seed";
import { upgradeWorkspace } from "./workspace-upgrade";
import { simulate } from "./engine";

describe("requested Chicago example", () => {
  it("adds a real child with inherited history and estimated Chicago events exactly once", () => {
    const original = seed();
    const next = upgradeWorkspace(original);
    const parent = next.universes[0];
    const child = next.universes.find((u) => u.name === "Move to Chicago")!;
    expect(child.parentId).toBe(parent.id);
    expect(child.events.slice(0, parent.events.length)).toEqual(parent.events);
    expect(
      child.events
        .filter((event) => !parent.events.includes(event))
        .every((event) => event.estimated),
    ).toBe(true);
    expect(simulate(next.profile, child.events)[12].expenses).not.toBe(
      simulate(next.profile, parent.events)[12].expenses,
    );
    expect(upgradeWorkspace(next)).toBe(next);
    expect(original.universes).toHaveLength(3);
    expect(next.profile).toBe(original.profile);
  });

  it("archives duplicate names without deleting their events or child connections", () => {
    const original = seed();
    const extra = makeUniverse(
      "A new york chapter",
      "Another version",
      original.universes[0].events,
    );
    const child = {
      ...makeUniverse("Existing child", "Keep this history", []),
      parentId: extra.id,
    };
    original.universes.push(extra, child);
    const next = upgradeWorkspace(original);
    expect(
      next.universes.filter(
        (u) => !u.archived && u.name.toLowerCase() === "a new york chapter",
      ),
    ).toHaveLength(1);
    expect(next.universes.find((u) => u.id === extra.id)?.events).toEqual(
      extra.events,
    );
    expect(next.universes.find((u) => u.id === child.id)?.parentId).toBe(
      extra.id,
    );
  });
});
