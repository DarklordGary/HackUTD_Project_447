// Exact mocked model outputs for offline tests. Never imported by application code.
import type { Mode, Profile, Universe } from "./types";
import type { Interpretation } from "./contracts";
import { seed } from "./seed";

export function modelFixture(
  prompt: string,
  _mode: Mode,
  universe?: Universe,
  _profile?: Pick<Profile, "annualSalary" | "rent">,
): Interpretation {
  const base: Interpretation = {
    name: "Conversation",
    description: prompt,
    events: [],
    assumptions: [],
  };
  switch (prompt) {
    case "Can I move to New York?": {
      const ny = seed().universes[0];
      return {
        ...base,
        name: ny.name,
        operation: "create",
        events: ny.events.map(({ id: _id, ...event }) => event),
        assumptions: ny.assumptions,
      };
    }
    case "What if I got a $90,000 job two months after moving?":
      return {
        ...base,
        name: "NYC with a new job",
        operation: "branch",
        targetUniverseId: universe?.id,
        events: [
          {
            kind: "salary",
            label: "Start the new job",
            month: 7,
            amount: 90000,
            estimated: false,
          },
        ],
        assumptions: ["Annual gross salary: $90,000"],
      };
    case "I got a new job paying $90,000.":
      return {
        ...base,
        operation: "reality",
        reality: { annualSalary: 90000 },
      };
    case "What if rent was $2,100?":
      return {
        ...base,
        operation: "modify",
        targetUniverseId: universe?.id,
        events: [
          {
            kind: "rent",
            label: "Updated monthly rent",
            month: 5,
            amount: 2100,
            estimated: false,
            replaceEventId: universe?.events.find(
              (event) => event.kind === "rent",
            )?.id,
          },
        ],
      };
    case "I paid off my credit card.":
      return {
        ...base,
        operation: "reality",
        reality: { creditPaidOff: true },
      };
    case "Make me rich":
    case "I got a job":
      return {
        ...base,
        clarification: "What financial goal would you like to explore?",
      };
    case "What if I got the job immediately?":
      return {
        ...base,
        operation: "modify",
        events: [
          {
            kind: "salary",
            label: "Start the new job",
            month: 5,
            amount: 90000,
            estimated: false,
            replaceEventId: universe?.events.find(
              (event) => event.kind === "salary",
            )?.id,
          },
        ],
      };
    case "What if I bought a $25,000 car?":
      return {
        ...base,
        name: "The open road",
        operation: "create",
        events: [
          {
            kind: "expense",
            label: "Purchase a car",
            month: 1,
            amount: 25000,
            estimated: false,
          },
          {
            kind: "monthly-expense",
            label: "Car running costs",
            month: 1,
            amount: 250,
            estimated: true,
          },
        ],
      };
    default:
      throw new Error(`Missing mock model fixture: ${prompt}`);
  }
}
