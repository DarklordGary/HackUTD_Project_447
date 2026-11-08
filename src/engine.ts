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
export function dateMonth(profile: Profile, date: string) {
  const [y, m] = date.split("-").map(Number), [sy, sm] = profile.startDate.split("-").map(Number);
  return (y - sy) * 12 + m - sm;
}
/** Current recurring facts only; opening cash is never advanced by this read. */
export function currentFacts(profile: Profile) {
  const facts = { annualSalary: profile.openingAnnualSalary ?? profile.annualSalary, rent: profile.openingRent ?? profile.rent, recurring: profile.recurring };
  const now = profile.assessmentDate ?? new Date().toISOString().slice(0,10);
  const month = dateMonth(profile, now);
  const events = (profile.actualEvents ?? []).filter(a => a.effectiveDate <= now).flatMap(a => a.events.map(e => ({ ...e, month: dateMonth(profile, a.effectiveDate) + e.month - 1 }))).sort((a,b) => a.month-b.month);
  for (const e of events.filter(e => e.month <= month)) {
    if (e.kind === "salary") facts.annualSalary = e.amount;
    if (e.kind === "rent") facts.rent = e.amount;
    if (e.kind === "monthly-expense") facts.recurring += e.amount;
  }
  return facts;
}
export function salaryTarget(salary: NonNullable<FinancialEvent["salary"]>) {
  return round(salary.mode === "absolute" ? salary.value : salary.baseline +
    (salary.mode === "percent" ? salary.baseline * salary.value / 100 : salary.value));
}
export function loanPayment(principal: number, apr: number, term: number) {
  const r = apr / 12;
  return round(r ? principal * r / (1 - Math.pow(1 + r, -term)) : principal / term);
}
export function eventAmountLabel(event: FinancialEvent) {
  if (event.salary) {
    const s = event.salary;
    if (s.mode === "absolute") return `${money(s.value)}/yr salary`;
    const raise = s.mode === "percent" ? `${s.value}%` : money(s.value);
    return s.purpose === "additional" ? `${raise} additional annual raise` : `${raise} raise; ${money(salaryTarget(s))}/yr target${s.status === "fulfilled" ? " (fulfilled)" : ""}`;
  }
  if (event.financing) return `${money(event.amount)} price; ${money(event.financing.downPayment)} down`;
  return money(event.amount) + (event.kind === "salary" ? "/yr" : ["rent", "monthly-expense", "debt-payment", "contribution"].includes(event.kind) ? "/mo" : "");
}
export function validateEvent(event: FinancialEvent) {
  if (event.salary && event.kind !== "salary") throw new Error("Salary semantics require a salary event.");
  if (event.kind === "financed-purchase") {
    const f = event.financing;
    if (!f || ![f.downPayment, f.apr, f.termMonths, f.runningCosts, event.amount].every(Number.isFinite) || f.downPayment < 0 || f.downPayment > event.amount || f.apr < 0 || f.apr > 1 || !Number.isInteger(f.termMonths) || f.termMonths < 1 || f.termMonths > 600 || f.runningCosts < 0) throw new Error("Purchase requires valid financing and down payment.");
    const principal = round(event.amount - f.downPayment);
    if (principal > 1000000) throw new Error("Borrowing cap is $1,000,000.");
    if (principal > 0 && f.payment !== undefined && f.payment < loanPayment(principal, f.apr, f.termMonths))
      throw new Error("Payment is insufficient to amortize the loan within its term.");
  } else if (event.financing) throw new Error("Financing requires a financed-purchase event.");
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
  let salary = profile.openingAnnualSalary ?? profile.annualSalary,
    rent = profile.openingRent ?? profile.rent,
    extraExpense = 0,
    extraDebt = 0,
    contribution = profile.contribution;
  const debts = profile.debts.map((d) => ({ ...d }));
  events.forEach(validateEvent);
  const actual = (profile.actualEvents ?? []).flatMap(entry => entry.events.map(e => ({ ...e,
    month: dateMonth(profile, entry.effectiveDate) + e.month - 1,
  })));
  const scheduled = [...actual, ...events.filter(e => !e.fulfilledBy)]
    .map((e, i) => { validateEvent(e); return { ...e, order: i }; })
    .sort((a, b) => a.month - b.month || a.order - b.order);
  function applyEvent(event: FinancialEvent) {
    if (event.kind === "salary") {
      if (!event.salary) salary = event.amount;
      else if (event.salary.status !== "fulfilled") salary = event.salary.purpose === "additional"
        ? salaryTarget({ ...event.salary, baseline: salary }) : event.salary.purpose === "prerequisite" ? Math.max(salary, salaryTarget(event.salary)) : salaryTarget(event.salary);
    }
    if (event.kind === "rent") rent = event.amount;
    if (event.kind === "monthly-expense") extraExpense += event.amount;
    if (event.kind === "debt-payment") extraDebt = event.amount;
    if (event.kind === "contribution") contribution = event.amount;
    if (event.kind === "financed-purchase") {
      const f = event.financing!, principal = round(event.amount - f.downPayment);
      debts.push({ id: event.id, name: event.label, balance: principal, apr: f.apr,
        payment: f.payment ?? loanPayment(principal, f.apr, f.termMonths) });
      extraExpense += f.runningCosts;
      return f.downPayment;
    }
    return event.kind === "expense" ? event.amount : event.kind === "income" ? -event.amount : 0;
  }
  // Boundary events are booked once against opening cash, without advancing a month of income.
  for (const event of scheduled.filter(e => e.month <= 0)) {
    const cost = applyEvent(event), fromSavings = Math.min(savings, Math.max(0, cost));
    savings = round(savings - fromSavings); checking = round(checking - cost + fromSavings);
  }
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
    for (const event of scheduled.filter(e => e.month === month)) {
      const cost = applyEvent(event);
      if (cost >= 0) oneTimeExpense += cost; else oneTimeIncome -= cost;
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
  profile = universe.finalProfile ?? profile;
  const rows = simulate(profile, universe.events);
  // Evaluate every projected month against its own recurring living costs; one-time costs
  // reduce liquidity but do not inflate the emergency reserve. Include boundary liquidity.
  const recurring = universe.events.filter(e => !e.fulfilledBy && ["rent", "monthly-expense", "financed-purchase"].includes(e.kind));
  const reserves = rows.slice(1).map(row => {
    let rent = profile.openingRent ?? profile.rent, extra = 0;
    const actual = (profile.actualEvents ?? []).flatMap(a => a.events.map(e => ({ ...e, month: dateMonth(profile, a.effectiveDate) + e.month - 1 })));
    for (const e of [...actual, ...recurring].sort((a,b) => a.month - b.month)) {
      if (e.month > row.month) continue;
      if (e.kind === "rent") rent = e.amount;
      if (e.kind === "monthly-expense") extra += e.amount;
      if (e.kind === "financed-purchase") extra += e.financing!.runningCosts;
    }
    return (rent + profile.recurring + profile.variable + profile.obligations + extra) * 3;
  });
  const reserve = Math.max(...reserves);
  const minimum = Math.min(...rows.map(r => r.liquid));
  const firstShortfall = rows.find((r, i) => r.liquid < reserves[Math.max(0, i - 1)]);
  const viable = !firstShortfall && rows.slice(-6).every(r => r.netCashFlow >= 0);
  return {
    viable,
    firstShortfall,
    shortfallReserve: firstShortfall ? reserves[Math.max(0, firstShortfall.month - 1)] : undefined,
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
