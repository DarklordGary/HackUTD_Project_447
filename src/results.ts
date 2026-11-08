import type { FinancialEvent, Profile, Projection, Universe } from "./types";
import { money } from "./engine";
export function minimumLiquidity(rows: Projection[]) {
  return rows.reduce(
    (minimum, row) => (row.liquid < minimum.liquid ? row : minimum),
    rows[0],
  );
}
export function signedMoney(amount: number) {
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${money(Math.abs(amount))}`;
}
export function datesAlign(profile: Profile, other: Profile) {
  return profile.startDate === other.startDate;
}
export function groupEvents(events: FinancialEvent[]) {
  return [...new Set(events.map((e) => e.month))]
    .sort((a, b) => a - b)
    .map((month) => ({
      month,
      events: events.filter((e) => e.month === month),
    }));
}
export function comparisonSource(universe: Universe, universes: Universe[]) {
  const id = universe.revisionOfId ?? universe.parentId;
  return {
    source: universes.find((u) => u.id === id),
    missing: !!id && !universes.some((u) => u.id === id),
  };
}
