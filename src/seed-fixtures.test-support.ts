import { seed, id, makeUniverse, colors } from "./seed";
import type { AppState } from "./types";

/** Historical examples for offline tests and integration checks. */
export function seedExamples(): AppState {
  const ny = makeUniverse(
    "A New York chapter",
    "A new city. A little more possibility.",
    [
      {
        id: id(),
        kind: "expense",
        label: "Make the move to NYC",
        month: 5,
        amount: 4500,
        estimated: true,
      },
      {
        id: id(),
        kind: "rent",
        label: "New York apartment",
        month: 5,
        amount: 2400,
        estimated: true,
      },
      {
        id: id(),
        kind: "monthly-expense",
        label: "NYC living cost adjustment",
        month: 5,
        amount: 350,
        estimated: true,
      },
    ],
    "city",
  );
  ny.assumptions = [
    "Move in April 2027; $4,500 moving costs",
    "Rent: $2,400/month (estimate)",
    "Additional NYC living costs: $350/month (estimate)",
  ];
  const home = makeUniverse(
    "A place to call mine",
    "Build a little room for your big plans.",
    [
      {
        id: id(),
        kind: "monthly-expense",
        label: "Save an extra $300 each month",
        month: 1,
        amount: -300,
        estimated: false,
      },
    ],
    "home",
    colors[1],
  );
  home.assumptions = [
    "Reduce variable spending by $300/month",
    "Track a $50,000 down payment savings milestone; no home purchase is modeled yet",
  ];
  const debt = makeUniverse(
    "The debt-free feeling",
    "Less owing. More living.",
    [
      {
        id: id(),
        kind: "debt-payment",
        label: "Extra monthly debt payment",
        month: 1,
        amount: 450,
        estimated: false,
      },
    ],
    "sparkles",
    colors[2],
  );
  debt.assumptions = [
    "Pay $450 extra toward debt every month",
    "No new borrowing",
  ];
  return {
    ...seed(),
    examplesVersion: 1,
    universes: [ny, home, debt],
    notices: [
      {
        id: id(),
        title: "Your next chapter is taking shape",
        text: "You have three possibilities to explore. Try branching your New York universe with a new salary.",
        time: new Date().toISOString(),
        read: false,
        universeId: ny.id,
      },
    ],
  };
}
