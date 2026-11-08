import type { AppState, FinancialEvent, Profile, Universe } from "./types";
import type { Interpretation } from "./interpreter";
import { assess, money, simulate } from "./engine";
import { id, seed } from "./seed";
export const STORAGE_KEY = "ping.multiverse.v1";
export function readState(): AppState {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      data?.version === 1 &&
      Array.isArray(data.universes) &&
      data.profile?.annualSalary
    )
      return data;
  } catch {
    /* Restore seeded profile if storage is corrupt. */
  }
  return seed();
}
export function mergeEvents(
  existing: FinancialEvent[],
  incoming: Interpretation["events"],
  removeEventIds: string[] = [],
  explicitOperations = false,
): FinancialEvent[] {
  // Live tool calls replace/remove exact IDs; legacy label matching is only for the offline demo.
  return [
    ...existing.filter(
      (old) =>
        !removeEventIds.includes(old.id) &&
        !incoming.some(
          (e) =>
            e.replaceEventId === old.id ||
            (!explicitOperations &&
              e.kind === old.kind &&
              ((e.month === old.month &&
                ["salary", "rent", "debt-payment", "contribution"].includes(
                  e.kind,
                )) ||
                e.label === old.label)),
        ),
    ),
    ...incoming.map(({ replaceEventId, ...e }) => ({
      ...e,
      id: replaceEventId ?? id(),
    })),
  ];
}
export function mergeAssumptions(
  existing: string[],
  data: Interpretation,
): string[] {
  if (data.explicitOperations)
    return [
      ...new Set([
        ...existing.filter((a) => !data.removeAssumptions?.includes(a)),
        ...data.assumptions,
      ]),
    ];
  const rent = data.events.some((e) => e.kind === "rent"),
    salary = data.events.some((e) => e.kind === "salary");
  const moving = data.assumptions.some((a) => a.startsWith("Move rescheduled"));
  return [
    ...new Set([
      ...existing.filter(
        (a) =>
          !(rent && /rent:/i.test(a)) &&
          !(salary && /annual gross salary:|salary starts/i.test(a)) &&
          !(moving && /^Move in/i.test(a)),
      ),
      ...data.assumptions,
    ]),
  ];
}
export function explain(profile: Profile, universe: Universe, source: string) {
  const { rows, viable, minimum, reserve } = assess(profile, universe);
  const end = rows[36];
  const lowMonth = rows.slice(1).find((r) => r.liquid === minimum);
  return `${source === "Nemotron" ? "I’ve interpreted" : "Demo interpretation of"} your scenario. ${viable ? "This path stays above your three-month emergency reserve." : `This path needs attention: liquid funds reach ${money(minimum)}${lowMonth ? ` in ${lowMonth.date}` : ""}, against a ${money(reserve)} reserve target.`} In 3 years, the engine projects ${money(end.netWorth)} net worth and ${money(end.savings)} savings. Open any month to see the breakdown. These are estimates, not guarantees.`;
}
export function applyReality(
  state: AppState,
  data: Interpretation,
  prompt: string,
): { state: AppState; explanation: string } {
  const change = data.reality;
  if (!change || !Object.values(change).some((v) => v !== undefined))
    throw new Error("No supported reality change was identified.");
  const before = structuredClone(state.profile);
  const after = structuredClone(before);
  if (change.annualSalary !== undefined)
    after.annualSalary = change.annualSalary;
  if (change.rent !== undefined) after.rent = change.rent;
  if (change.bonus !== undefined) after.savings += change.bonus;
  if (change.creditPaidOff) {
    const card = after.debts.find((d) => d.id === "credit");
    if (card) {
      const pay = card.balance;
      const fromSavings = Math.min(after.savings, pay);
      after.savings -= fromSavings;
      after.checking -= pay - fromSavings;
      card.balance = 0;
    }
  }
  after.updatedAt = new Date().toISOString();
  const notices = state.universes.map((u) => {
    const prev = assess(before, u),
      next = assess(after, u);
    const delta = next.rows[36].netWorth - prev.rows[36].netWorth;
    const conflicts = u.events.filter(
      (e) =>
        (e.kind === "salary" && change.annualSalary !== undefined) ||
        (e.kind === "rent" && change.rent !== undefined),
    );
    return {
      id: id(),
      title:
        !prev.viable && next.viable
          ? `${u.name} is now within reach`
          : `${u.name} has a new outlook`,
      text: `${money(prev.rows[36].netWorth)} → ${money(next.rows[36].netWorth)} projected net worth in 3 years (${delta >= 0 ? "+" : ""}${money(delta)}). ${conflicts.length ? `${conflicts.length} hypothetical ${conflicts.map((e) => e.kind).join("/")} event(s) retained. Review them in the universe's assumptions.` : "All hypothetical choices were preserved."}`,
      time: after.updatedAt,
      read: false,
      universeId: u.id,
    };
  });
  const newViable = state.universes.filter(
    (u) => !assess(before, u).viable && assess(after, u).viable,
  );
  const baselineDelta =
    simulate(after)[36].netWorth - simulate(before)[36].netWorth;
  return {
    state: {
      ...state,
      profile: after,
      notices: [...notices, ...state.notices],
      changes: [
        { id: id(), prompt, before, after, time: after.updatedAt },
        ...state.changes,
      ],
    },
    explanation: `Your real financial profile is updated. I recalculated all ${state.universes.length} universes. ${newViable.length ? `${newViable.map((u) => u.name).join(", ")} ${newViable.length === 1 ? "is" : "are"} now viable under the three-month reserve rule. ` : ""}Your baseline 3-year net worth changes by ${money(baselineDelta)}. Hypothetical decisions are preserved; any salary or rent conflicts are flagged for your review. See Updates for before-and-after projections.`,
  };
}
