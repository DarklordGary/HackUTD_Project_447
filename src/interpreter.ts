import type { Mode, Profile, Universe, Message } from "./types";
import { interpretationSchema } from "./contracts";
import type { Interpretation } from "./contracts";
export { eventSchema, interpretationSchema } from "./contracts";
export type { Interpretation } from "./contracts";
const amounts = (s: string) =>
  [
    ...s.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(k)?\b|\b(\d+(?:\.\d+)?)\s*k\b/gi),
  ].map(
    (m) =>
      Number((m[1] || m[3]).replaceAll(",", "")) * (m[2] || m[3] ? 1000 : 1),
  );
/** Predictable, explicitly labeled offline demo. Unsupported requests ask for clarification. */
export function interpretDemo(
  prompt: string,
  mode: Mode,
  universe?: Universe,
  profile?: Pick<Profile, "annualSalary" | "rent">,
): Interpretation {
  const s = prompt.toLowerCase();
  const values = amounts(s);
  const amount = values[0];
  const result: Interpretation = {
    name: "A new possibility",
    description: prompt,
    events: [],
    assumptions: [],
  };
  if (mode === "reality") {
    result.name = "Reality updated";
    result.reality = {};
    if (/salary|job|paying|earn|income/.test(s) && amount)
      result.reality.annualSalary = amount;
    if (/bonus|received|windfall/.test(s) && amount)
      result.reality.bonus = amount;
    if (/rent|apartment/.test(s) && amount)
      result.reality.rent = /increas|up by/.test(s)
        ? (profile?.rent ?? 1600) + amount
        : amount;
    if (/paid off.*(credit|card)|credit.*paid off/.test(s))
      result.reality.creditPaidOff = true;
    if (
      Object.keys(result.reality).filter(
        (k) => result.reality?.[k as keyof typeof result.reality] !== undefined,
      ).length === 0
    )
      result.clarification =
        "Try “My salary increased to $85,000”, “I received a $5,000 bonus”, “My rent is $1,800”, or “I paid off my credit card”.";
    return interpretationSchema.parse(result);
  }
  let month = 1;
  const moveMonth = universe?.events.find((e) => e.kind === "rent")?.month ?? 5;
  const relative = s.match(/(\d+|one|two|three|four|five|six) months? after/);
  if (relative) {
    const n =
      Number(relative[1]) ||
      ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[relative[1]] ??
        2);
    month = moveMonth + n;
  } else if (/immediately|same time|right away/.test(s)) month = moveMonth;
  else {
    const m = s.match(/in (\d+) months?/);
    if (m) month = Number(m[1]);
  }
  const add = (
    kind: Interpretation["events"][number]["kind"],
    label: string,
    value: number,
    when = month,
    estimated = false,
  ) =>
    result.events.push({ kind, label, amount: value, month: when, estimated });
  if (
    /new york|\bnyc\b/.test(s) &&
    /move|live|afford|new york/.test(s) &&
    !universe
  ) {
    result.name = "A New York chapter";
    result.description = "Your next chapter, in the city that never sleeps.";
    add("expense", "Make the move to NYC", 4500, 5, true);
    add("rent", "New York apartment", 2400, 5, true);
    add("monthly-expense", "NYC living cost adjustment", 350, 5, true);
    result.assumptions.push(
      "Move in April 2027 (month 5)",
      "Estimated moving costs: $4,500",
      "Estimated NYC rent: $2,400/month",
      "Additional living costs: $350/month (estimate)",
    );
  }
  const existingSalary = universe?.events
    .filter((e) => e.kind === "salary")
    .at(-1)?.amount;
  const salary = amount ?? existingSalary;
  if (
    /job|salary|paying|earn/.test(s) &&
    salary &&
    !/moved? .*after.*job/.test(s)
  ) {
    add("salary", "Start the new job", salary);
    result.name = universe
      ? `${universe.name.replace(/ · new job$/, "")} · new job`
      : "A fresh career chapter";
    result.assumptions.push(
      `Annual gross salary: $${salary.toLocaleString()}; estimated 24% effective tax rate`,
      `Salary starts in month ${month}${relative ? ", relative to the existing move" : ""}`,
    );
  }
  if (/mov/.test(s) && universe && !result.events.length) {
    const jobMonth = universe.events.find((e) => e.kind === "salary")?.month;
    if (/after.*job/.test(s) && relative && jobMonth !== undefined)
      month =
        jobMonth +
        (Number(relative[1]) ||
          ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }[
            relative[1]
          ] ??
            2));
    if (/after.*job/.test(s) && jobMonth === undefined)
      result.clarification =
        "Add a salary event to this universe first, then I can schedule the move relative to it.";
    else if (relative || /in \d+ months?|immediately/.test(s)) {
      for (const event of universe.events.filter(
        (e) =>
          e.kind === "rent" || /move|living cost adjustment/i.test(e.label),
      ))
        add(event.kind, event.label, event.amount, month, event.estimated);
      result.name = universe.name;
      result.assumptions.push(
        `Move rescheduled to month ${month}; existing moving cost and rent amounts retained`,
      );
    }
  }
  if (/rent/.test(s) && amount && !/new york/.test(s)) {
    const old =
      universe?.events.filter((e) => e.kind === "rent").at(-1)?.amount ??
      profile?.rent ??
      1600;
    add(
      "rent",
      "Updated monthly rent",
      /increas|up by|more/.test(s) ? old + amount : amount,
      universe ? moveMonth : month,
    );
    result.name = universe?.name ?? "A different place";
    result.assumptions.push(
      `Rent: $${result.events.at(-1)!.amount.toLocaleString()}/month (scenario input)`,
    );
  }
  if (/car|vehicle/.test(s) && amount) {
    result.name = "The open road";
    add("expense", "Buy the car", amount);
    add("monthly-expense", "Car insurance and running costs", 250, month, true);
    result.assumptions.push(
      "Cash purchase; no financing",
      "$250/month additional running costs (estimate); vehicle resale value not modeled",
    );
  }
  if (/debt.free|pay.*debt|pay.*loan/.test(s)) {
    result.name = "The debt-free feeling";
    add("debt-payment", "Extra monthly debt payment", amount ?? 450);
    result.assumptions.push(
      `$${amount ?? 450} extra monthly toward existing debts`,
    );
  }
  if (/save|spend.*less|cut.*spend/.test(s) && amount) {
    result.name = "A little more freedom";
    add("monthly-expense", "Reduce monthly spending", -amount);
    result.assumptions.push(`Reduce monthly spending by $${amount}`);
  }
  if (/bonus/.test(s) && amount) {
    result.name = "A welcome windfall";
    add("income", "One-time bonus (net)", amount);
    result.assumptions.push("Bonus treated as net of taxes");
  }
  if (/grad|school|study/.test(s)) {
    result.name = "Invest in yourself";
    add("expense", "Graduate school tuition", amount ?? 18000, 9, !amount);
    result.assumptions.push(
      "One year tuition; current employment continues; no student borrowing",
    );
  }
  if (/house|home|down payment/.test(s) && !result.events.length) {
    result.name = "A place to call mine";
    add("monthly-expense", "Spend less, save for a home", -(amount ?? 300));
    result.assumptions.push(
      "Track $50,000 savings for a down payment; home purchase is not yet modeled",
    );
  }
  if (!result.events.length)
    result.clarification =
      "I can model a move to New York, a salary change, rent, a car purchase, debt payments, a bonus, tuition, or spending changes. Include an amount when you have one. Try “What if rent was $2,400?”";
  return interpretationSchema.parse(result);
}
export async function interpret(
  prompt: string,
  mode: Mode,
  universe?: Universe,
  profile?: Profile,
  universes: Universe[] = [],
  history: Message[] = [],
): Promise<{
  data: Interpretation;
  source: string;
  tools: { tool: string; status: "ok" | "error" }[];
}> {
  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      mode,
      universe: universe ? { ...universe, messages: [] } : undefined,
      profile,
      universes: universes.map((u) => ({ ...u, messages: [] })),
      history: history.slice(-20),
    }),
    signal: AbortSignal.timeout(100000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || "The interpreter is unavailable. Please try again.",
    );
  }
  const body = await response.json();
  return {
    data: interpretationSchema.parse(body.data),
    source: body.source,
    tools: Array.isArray(body.tools) ? body.tools : [],
  };
}
