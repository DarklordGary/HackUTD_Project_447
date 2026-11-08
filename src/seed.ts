import type { AppState, Universe } from "./types";
export const id = () => crypto.randomUUID();
export const colors = ["#4e8b6c", "#b69bd7", "#d0a76a", "#699cc1", "#cd8c8f"];
export function makeUniverse(
  name: string,
  description: string,
  events: Universe["events"],
  icon: Universe["icon"] = "sparkles",
  color = colors[0],
): Universe {
  return {
    id: id(),
    name,
    description,
    events,
    icon,
    color,
    createdAt: new Date().toISOString(),
    assumptions: [],
    messages: [],
  };
}
export function seed(): AppState {
  return {
    version: 1,
    examplesVersion: 2,
    profile: {
      name: "Alex Morgan",
      location: "Austin, TX",
      startDate: "2026-11-01",
      checking: 4250,
      savings: 18750,
      annualSalary: 72000,
      taxRate: 0.24,
      rent: 1600,
      recurring: 380,
      variable: 780,
      obligations: 120,
      debts: [
        {
          id: "credit",
          name: "Credit card",
          balance: 2400,
          apr: 0.199,
          payment: 180,
        },
        {
          id: "student",
          name: "Student loan",
          balance: 11600,
          apr: 0.045,
          payment: 220,
        },
      ],
      investments: 21400,
      contribution: 450,
      investmentReturn: 0.06,
      savingsRate: 0.035,
      updatedAt: new Date().toISOString(),
    },
    universes: [],
    notices: [],
    changes: [],
  };
}
