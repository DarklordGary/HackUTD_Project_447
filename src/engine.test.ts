import { describe, expect, it } from "vitest";
import { assess, simulate } from "./engine";
import { seed } from "./seed";
import { modelFixture } from "./model-fixtures.test-support";
import { applyReality, mergeEvents } from "./state";
describe("deterministic monthly simulation", () => {
  it("balances the first month to the cent, including debt interest and investment contributions", () => {
    const p = seed().profile;
    const [start, first] = simulate(p);
    expect(start.netWorth).toBe(30400);
    expect(first.income).toBe(4560);
    expect(first.expenses).toBe(2880);
    expect(first.debtPayments).toBe(400);
    expect(first.netCashFlow).toBe(830);
    expect(first.debt).toBe(13683.3);
    expect(first.savings).toBe(19634.69);
    expect(first.investments).toBe(21954.17);
    expect(first.netWorth).toBeCloseTo(
      first.checking + first.savings + first.investments - first.debt,
      2,
    );
  });
  it("runs identically and does not mutate its inputs", () => {
    const s = seed();
    const before = JSON.stringify(s);
    expect(simulate(s.profile, s.universes[0].events)).toEqual(
      simulate(s.profile, s.universes[0].events),
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it("schedules one-time costs exactly once and persistent salary changes chronologically", () => {
    const p = seed().profile;
    const base = simulate(p);
    const rows = simulate(p, [
      {
        id: "e",
        kind: "expense",
        label: "Move",
        amount: 4500,
        month: 5,
        estimated: true,
      },
      {
        id: "j",
        kind: "salary",
        label: "Job",
        amount: 90000,
        month: 7,
        estimated: false,
      },
    ]);
    expect(rows[4]).toEqual(base[4]);
    expect(rows[5].expenses).toBe(base[5].expenses + 4500);
    expect(rows[6].expenses).toBe(base[6].expenses);
    expect(rows[6].income).toBe(4560);
    expect(rows[7].income).toBe(5700);
    expect(rows[36].income).toBe(5700);
  });
  it("caps debt payments at the outstanding amount including interest", () => {
    const p = seed().profile;
    p.debts = [
      { id: "d", name: "Small loan", balance: 100, apr: 0.12, payment: 400 },
    ];
    const rows = simulate(p);
    expect(rows[1].debtPayments).toBe(101);
    expect(rows[1].debt).toBe(0);
    expect(rows[2].debtPayments).toBe(0);
  });
  it("exposes insolvency rather than silently clamping cash to zero", () => {
    const p = seed().profile;
    const row = simulate(p, [
      {
        id: "e",
        kind: "expense",
        label: "Large expense",
        amount: 100000,
        month: 1,
        estimated: false,
      },
    ])[1];
    expect(row.liquid).toBeLessThan(0);
    expect(row.savings).toBe(0);
    expect(row.checking).toBeLessThan(0);
  });
});
describe("full demo journey", () => {
  it("creates NYC, branches a relative job change, preserves the original, then recalculates reality", () => {
    const s = seed();
    const ny = s.universes[0];
    const original = JSON.stringify(ny);
    const created = modelFixture("Can I move to New York?", "create");
    expect(created.events).toHaveLength(3);
    const job = modelFixture(
      "What if I got a $90,000 job two months after moving?",
      "branch",
      ny,
    );
    expect(job.events[0]).toMatchObject({
      kind: "salary",
      amount: 90000,
      month: 7,
    });
    const branch = {
      ...structuredClone(ny),
      id: "branch",
      parentId: ny.id,
      events: mergeEvents(ny.events, job.events),
    };
    expect(JSON.stringify(ny)).toBe(original);
    expect(simulate(s.profile, branch.events)[6]).toEqual(
      simulate(s.profile, ny.events)[6],
    );
    expect(assess(s.profile, ny).viable).toBe(false);
    expect(assess(s.profile, branch).viable).toBe(true);
    s.universes.push(branch);
    const update = modelFixture("I got a new job paying $90,000.", "reality");
    const result = applyReality(s, update, "New job");
    expect(result.state.profile.annualSalary).toBe(90000);
    expect(s.profile.annualSalary).toBe(72000);
    expect(assess(result.state.profile, ny).viable).toBe(true);
    expect(result.explanation).toContain("now viable");
    expect(result.state.universes).toEqual(s.universes);
    expect(result.state.changes[0].before.annualSalary).toBe(72000);
    expect(
      result.state.notices.some((n) => n.text.includes("hypothetical salary")),
    ).toBe(true);
  });
  it("changes rent without dropping move costs or job assumptions", () => {
    const s = seed(),
      ny = s.universes[0];
    const result = modelFixture("What if rent was $2,100?", "modify", ny);
    const merged = mergeEvents(ny.events, result.events);
    expect(merged.filter((e) => e.kind === "rent")).toHaveLength(1);
    expect(merged.find((e) => e.kind === "rent")?.amount).toBe(2100);
    expect(merged.find((e) => e.kind === "expense")?.amount).toBe(4500);
  });
  it("paying off a card consumes cash and preserves initial net worth", () => {
    const s = seed();
    const result = applyReality(
      s,
      modelFixture("I paid off my credit card.", "reality"),
      "paid card",
    );
    expect(result.state.profile.savings).toBe(16350);
    expect(result.state.profile.debts[0].balance).toBe(0);
    expect(simulate(result.state.profile)[0].netWorth).toBe(
      simulate(s.profile)[0].netWorth,
    );
  });
  it("requests clarification instead of making up unsupported changes", () => {
    expect(modelFixture("Make me rich", "create").clarification).toBeTruthy();
    expect(modelFixture("I got a job", "reality").clarification).toBeTruthy();
  });
  it("reschedules a referenced job while retaining its existing salary amount", () => {
    const ny = seed().universes[0];
    const job = modelFixture(
      "What if I got a $90,000 job two months after moving?",
      "branch",
      ny,
    );
    const branch = { ...ny, events: mergeEvents(ny.events, job.events) };
    const immediate = modelFixture(
      "What if I got the job immediately?",
      "modify",
      branch,
    );
    const merged = mergeEvents(branch.events, immediate.events);
    expect(merged.filter((e) => e.kind === "salary")).toHaveLength(1);
    expect(merged.find((e) => e.kind === "salary")).toMatchObject({
      amount: 90000,
      month: 5,
    });
  });
});
