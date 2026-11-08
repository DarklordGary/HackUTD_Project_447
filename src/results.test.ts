import { describe, expect, it } from "vitest";
import {
  comparisonSource,
  datesAlign,
  groupEvents,
  minimumLiquidity,
  signedMoney,
} from "./results";
import { seedExamples } from "./seed-fixtures.test-support";
import { simulate } from "./engine";
describe("factual result observations", () => {
  it("includes opening and final liquidity and resolves ties to the first month", () => {
    const rows = simulate(seedExamples().profile);
    const tied = rows.map((r) => ({ ...r, liquid: 100 }));
    expect(minimumLiquidity(tied).month).toBe(0);
    tied[36].liquid = -20;
    expect(minimumLiquidity(tied).month).toBe(36);
    tied[3].liquid = -20;
    expect(minimumLiquidity(tied).month).toBe(3);
  });
  it("groups every event and resolves actual sources or an explicit Main Reality fallback", () => {
    const { universes, profile } = seedExamples();
    const events = Array.from({ length: 12 }, (_, i) => ({
      ...universes[0].events[0],
      id: String(i),
      month: i % 7,
    }));
    expect(groupEvents(events).flatMap((g) => g.events)).toHaveLength(12);
    expect(groupEvents(events)[0].events).toHaveLength(2);
    const plan = { ...universes[0], parentId: universes[1].id };
    expect(comparisonSource(plan, universes).source?.id).toBe(universes[1].id);
    expect(
      comparisonSource({ ...plan, revisionOfId: "missing" }, universes).missing,
    ).toBe(true);
    expect(
      comparisonSource({ ...plan, parentId: undefined }, universes).source,
    ).toBeUndefined();
    expect(datesAlign(profile, { ...profile, startDate: "2020-01-01" })).toBe(
      false,
    );
    expect(signedMoney(0)).toBe("$0");
    expect(signedMoney(-100)).toBe("−$100");
  });
});
