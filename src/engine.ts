import type { FinancialEvent, Profile, Projection, Universe } from "./types";
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...(compact
      ? { notation: "compact" as const, maximumFractionDigits: 1 }
      : {}),
  }).format(n);
export function monthLabel(profile: Profile, month: number, long = false) {
  const date = new Date(`${profile.startDate}T12:00:00`);
  date.setMonth(date.getMonth() + month);
  return date.toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
  });
}
/** All arithmetic happens here, independently of interpretation. Amounts are USD, APRs decimal. */
export function simulate(
  profile: Profile,
  events: FinancialEvent[] = [],
  months = 36,
): Projection[] {
  let checking = profile.checking,
    savings = profile.savings,
    investments = profile.investments;
  let salary = profile.annualSalary,
    rent = profile.rent,
    extraExpense = 0,
    extraDebt = 0,
    contribution = profile.contribution;
  const debts = profile.debts.map((d) => ({ ...d }));
  const scheduled = events
    .map((e, i) => ({ ...e, order: i }))
    .sort((a, b) => a.month - b.month || a.order - b.order);
  const startingDebt = debts.reduce((s, d) => s + d.balance, 0);
  const result: Projection[] = [
    {
      month: 0,
      date: monthLabel(profile, 0),
      income: 0,
      expenses: 0,
      debtPayments: 0,
      investmentContribution: 0,
      investmentGrowth: 0,
      netCashFlow: 0,
      checking,
      savings,
      investments,
      debt: startingDebt,
      liquid: round(checking + savings),
      netWorth: round(checking + savings + investments - startingDebt),
    },
  ];
  for (let month = 1; month <= months; month++) {
    let oneTimeExpense = 0,
      oneTimeIncome = 0;
    for (const event of scheduled.filter((e) => e.month === month)) {
      if (event.kind === "salary") salary = event.amount;
      if (event.kind === "rent") rent = event.amount;
      if (event.kind === "monthly-expense") extraExpense += event.amount;
      if (event.kind === "debt-payment") extraDebt = event.amount;
      if (event.kind === "contribution") contribution = event.amount;
      if (event.kind === "expense") oneTimeExpense += event.amount;
      if (event.kind === "income") oneTimeIncome += event.amount;
    }
    const income = round((salary * (1 - profile.taxRate)) / 12 + oneTimeIncome);
    let debtPayments = 0,
      extraRemaining = extraDebt;
    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const due = round(debt.balance * (1 + debt.apr / 12));
      const payment = Math.min(due, debt.payment + extraRemaining);
      extraRemaining = Math.max(
        0,
        extraRemaining - Math.max(0, payment - debt.payment),
      );
      debt.balance = round(due - payment);
      debtPayments += payment;
    }
    const investmentGrowth = round(
      investments * (Math.pow(1 + profile.investmentReturn, 1 / 12) - 1),
    );
    investments = round(investments + investmentGrowth + contribution);
    const expenses = round(
      rent +
        profile.recurring +
        profile.variable +
        profile.obligations +
        extraExpense +
        oneTimeExpense,
    );
    const netCashFlow = round(income - expenses - debtPayments - contribution);
    savings = round(savings * (1 + profile.savingsRate / 12));
    // Maintain the original checking buffer; move surplus to savings and cover deficits from savings.
    checking = round(checking + netCashFlow);
    if (checking > profile.checking) {
      savings = round(savings + checking - profile.checking);
      checking = profile.checking;
    }
    if (checking < profile.checking && savings > 0) {
      const transfer = Math.min(profile.checking - checking, savings);
      checking = round(checking + transfer);
      savings = round(savings - transfer);
    }
    const debt = round(debts.reduce((s, d) => s + d.balance, 0));
    result.push({
      month,
      date: monthLabel(profile, month),
      income,
      expenses,
      debtPayments: round(debtPayments),
      investmentContribution: contribution,
      investmentGrowth,
      netCashFlow,
      checking,
      savings,
      debt,
      investments,
      liquid: round(checking + savings),
      netWorth: round(checking + savings + investments - debt),
    });
  }
  return result;
}
export function assess(profile: Profile, universe: Universe) {
  const rows = simulate(profile, universe.events);
  const move = universe.events.find((e) => e.kind === "rent");
  const month = move?.month ?? 1;
  const future = rows.slice(month);
  const reserve =
    (profile.rent +
      profile.recurring +
      profile.variable +
      profile.obligations) *
    3;
  const minimum = Math.min(...future.map((r) => r.liquid));
  const viable =
    minimum >= reserve && future.slice(-6).every((r) => r.netCashFlow >= 0);
  return {
    viable,
    minimum,
    reserve,
    status: viable
      ? "On track"
      : minimum < 0
        ? "Needs a rethink"
        : "Worth exploring",
    rows,
  };
}
export function milestones(rows: Projection[]) {
  const items: { month: number; label: string; type: "savings" | "debt" }[] =
    [];
  for (const target of [25000, 50000, 75000, 100000]) {
    const row = rows.find(
      (r, i) => i > 0 && r.savings >= target && rows[0].savings < target,
    );
    if (row)
      items.push({
        month: row.month,
        label: `${money(target, true)} in savings`,
        type: "savings",
      });
  }
  const payoff = rows.find((r, i) => i > 0 && r.debt === 0 && rows[0].debt > 0);
  if (payoff)
    items.push({
      month: payoff.month,
      label: "Completely debt-free",
      type: "debt",
    });
  return items.sort((a, b) => a.month - b.month);
}
