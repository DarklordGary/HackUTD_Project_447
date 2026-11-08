import { makeUniverse } from "./seed";
import type { AppState } from "./types";

/** One-time requested example update; preserves the profile and distinct scenario histories. */
export function upgradeWorkspace(state: AppState): AppState {
  if ((state.examplesVersion ?? 0) >= 1) return state;
  const matches = state.universes.filter(
    (u) => u.name.trim().toLowerCase() === "a new york chapter",
  );
  const parent = matches.find((u) => !u.archived) ?? matches[0];
  if (!parent) return { ...state, examplesVersion: 1 };
  // Hide duplicate names from the active list without deleting events, messages, or child links.
  const extras = new Set(
    matches.filter((u) => u.id !== parent.id).map((u) => u.id),
  );
  let universes = state.universes.map((u) =>
    extras.has(u.id) ? { ...u, archived: true } : u,
  );
  if (
    !universes.some((u) => u.parentId === parent.id && /chicago/i.test(u.name))
  ) {
    const month = Math.min(
      30,
      Math.max(12, ...parent.events.map((event) => event.month + 3)),
    );
    const chicago = makeUniverse(
      "Move to Chicago",
      "An example move from the New York chapter to Chicago.",
      [
        ...parent.events,
        {
          id: "chicago-move-cost",
          kind: "expense",
          label: "Move from New York to Chicago",
          month,
          amount: 3000,
          estimated: true,
        },
        {
          id: "chicago-rent",
          kind: "rent",
          label: "Chicago apartment",
          month,
          amount: 1800,
          estimated: true,
        },
        {
          id: "chicago-deposit-refund",
          kind: "income",
          label: "Previous apartment deposit returned",
          month: month + 1,
          amount: 1000,
          estimated: true,
        },
      ],
      "city",
      "#739985",
    );
    chicago.parentId = parent.id;
    chicago.assumptions = [
      ...parent.assumptions,
      "Example only: move to Chicago in month " +
        month +
        "; $3,000 one-time moving cost and $1,800 monthly rent.",
      "Example only: $1,000 deposit refund the following month; income and other living costs stay unchanged.",
    ];
    universes = [...universes, chicago];
  }
  return { ...state, universes, examplesVersion: 1 };
}
