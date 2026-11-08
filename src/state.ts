import type { AppState, FinancialEvent, Profile, Universe } from "./types";
import type { Interpretation } from "./interpreter";
import { assess, money, simulate, dateMonth, salaryTarget, currentFacts } from "./engine";
import { id, seed } from "./seed";
import { upgradeWorkspace } from "./workspace-upgrade";
import { workspaceSchema } from "./contracts";
export const STORAGE_KEY = "ping.multiverse.v1";
export function readState(): AppState {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      data?.version === 1 &&
      Array.isArray(data.universes) &&
      data.profile?.annualSalary
    )
      return upgradeWorkspace(workspaceSchema.parse(data));
  } catch {
    /* Restore seeded profile if storage is corrupt. */
  }
  return upgradeWorkspace(seed());
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
  const { rows, viable, firstShortfall, shortfallReserve } = assess(profile, universe);
  const end = rows[36];
  const result = viable ? "This path is viable and stays above your three-month emergency reserve."
    : firstShortfall ? `This path needs attention: liquid funds of ${money(firstShortfall.liquid)} fall below the ${money(shortfallReserve!)} reserve in ${firstShortfall.date} (month ${firstShortfall.month}).`
    : `This path needs attention: cash flow in the final six months is negative (month 36: ${money(end.netCashFlow)}).`;
  return `${source === "Nemotron" ? "I’ve interpreted" : "Demo interpretation of"} your scenario. ${result} In 3 years, the engine projects ${money(end.netWorth)} net worth and ${money(end.savings)} savings. Open any month to see the breakdown. These are estimates, not guarantees.`;
}

export function rescheduleGroup(events: FinancialEvent[], groupId: string, delay: number) {
  if (!Number.isInteger(delay)) throw new Error("Delay must be whole months.");
  if (events.some(e => e.groupId === groupId && e.fulfilledBy)) throw new Error("This move is already reality; explore a different future move.");
  if (!events.some(e => e.groupId === groupId)) throw new Error("Unknown event group.");
  return events.map(e => {
    if (e.groupId !== groupId) return e;
    const month = e.month + delay;
    if (month < 1 || month > 36) throw new Error("Entire move must remain inside the 36-month horizon.");
    return { ...e, month };
  });
}

export function applyReality(state: AppState, data: Interpretation, prompt: string) {
  const operationId = data.operationId ?? id();
  if (state.appliedOperationIds?.includes(operationId)) return { state, explanation: "This change was already recorded.", impacts: [] };
  const change = data.reality;
  if (!change || !Object.values(change).some(v => v !== undefined)) throw new Error("No supported reality change was identified.");
  if (change.salaryChange && change.annualSalary !== undefined) throw new Error("Supply salary semantics or absolute salary, not both.");
  const before = structuredClone(state.profile), after = structuredClone(before);
  const now = data.assessmentDate ?? before.assessmentDate ?? new Date().toISOString().slice(0,10);
  const effectiveDate = change.effectiveDate ?? now, month = dateMonth(before, effectiveDate);
  if (effectiveDate < before.startDate || month > 36) throw new Error("Actual date must be within the opening snapshot and 36-month horizon; older changes require an opening balance correction.");
  const isCurrent = effectiveDate <= now;
  if (change.move && !isCurrent) throw new Error("A completed move cannot be future dated. Explore it as a hypothetical instead.");
  const actualSalary = change.salaryChange ? salaryTarget({ ...change.salaryChange, baseline: currentFacts(before).annualSalary }) : change.annualSalary;
  function addActual(kind: "salary" | "rent", amount: number) {
    after.actualEvents = [...(after.actualEvents ?? []), { id: operationId + ":" + kind, effectiveDate, events: [{ id: operationId + ":" + kind, kind, label: "Actual " + kind, month: 1, amount, estimated: false }] }];
  }
  if (actualSalary !== undefined) {
    after.openingAnnualSalary ??= before.annualSalary;
    addActual("salary", actualSalary);
    if (isCurrent) after.annualSalary = actualSalary;
  }
  if (change.rent !== undefined) {
    after.openingRent ??= before.rent;
    addActual("rent", change.rent);
    if (isCurrent) after.rent = change.rent;
  }
  if (change.effectiveDate && (change.bonus !== undefined || change.creditPaidOff)) throw new Error("Dated bonus/payoff requires a current cash correction.");
  if (change.bonus !== undefined) after.savings += change.bonus;
  if (change.creditPaidOff) {
    const card = after.debts.find(d => d.id === "credit");
    if (card) { const fromSavings = Math.min(after.savings, card.balance); after.savings -= fromSavings; after.checking -= card.balance - fromSavings; card.balance = 0; }
  }
  after.updatedAt = now + "T12:00:00.000Z";
  const universes = structuredClone(state.universes);
  let realized: Universe | undefined;
  const disclosure: string[] = [];
  if (change.move) {
    const move = change.move;
    realized = universes.find(u => u.id === move.timelineId);
    if (!realized || realized.archived) throw new Error("Choose an active matching plan; this plan is missing or already archived.");
    const group = realized.events.filter(e => e.groupId === move.groupId && !e.fulfilledBy);
    const rent = group.find(e => e.kind === "rent");
    if (!rent || group.some(e => !["rent", "expense", "income", "monthly-expense"].includes(e.kind))) throw new Error("Choose a move group with rent and only move-related cash events.");
    if (!rent.destination || rent.destination.toLowerCase() !== move.location.toLowerCase()) throw new Error("Destination must match the selected move group.");
    if (!group.some(e => e.kind === "expense") && move.movingCost === undefined) throw new Error("No established moving-cost estimate exists. Ask for actual moving cost, including zero.");
    const actual = group.map(e => {
      const value = e.kind === "rent" ? move.rent : e.kind === "expense" ? move.movingCost : e.kind === "monthly-expense" ? move.localExpense : undefined;
      if (e.month < rent.month) throw new Error("Earlier move costs require explicit date reconciliation.");
      if (value !== undefined && group.filter(other => other.kind === e.kind).length > 1) throw new Error("Multiple costs need event-level reconciliation.");
      if (e.estimated && (value === undefined || value === e.amount)) disclosure.push(`${e.label}: ${money(e.amount)} (provisional estimate)`);
      return { ...e, id: operationId + ":" + e.id, month: 1 + e.month - rent.month, amount: value ?? e.amount, estimated: e.estimated && (value === undefined || value === e.amount), fulfilledBy: undefined };
    });
    if (!group.some(e => e.kind === "expense") && move.movingCost !== undefined) actual.push({ id: operationId + ":moving-cost", kind: "expense", label: "Actual moving cost", month: 1, amount: move.movingCost, estimated: false, fulfilledBy: undefined });
    if (!group.some(e => e.kind === "monthly-expense") && move.localExpense !== undefined) actual.push({ id: operationId + ":local-cost", kind: "monthly-expense", label: "Actual local expense adjustment", month: 1, amount: move.localExpense, estimated: false, fulfilledBy: undefined });
    after.location = move.location;
    after.openingRent ??= before.rent;
    after.rent = move.rent ?? rent.amount;
    after.actualEvents = [...(after.actualEvents ?? []), { id: operationId, effectiveDate, sourceUniverseId: realized.id, location: move.location, events: actual }];
    realized.archived = true; realized.archiveReason = "realized"; realized.realizedAt = effectiveDate;
    realized.realityChangeId = operationId; realized.finalProfile = before;
    for (const u of universes.filter(u => !u.archived)) {
      const groups = new Set(u.events.filter(e => e.kind === "rent" && e.destination?.toLowerCase() === move.location.toLowerCase()).map(e => e.groupId).filter(Boolean));
      u.events = u.events.map(e => e.groupId && groups.has(e.groupId) ? { ...e, fulfilledBy: operationId } : e);
      if (groups.size) u.assumptions.push(`Move to ${move.location} realized by ${realized.name}; this alternative's move is superseded by reality.`);
    }
  }
  const impacts = universes.filter(u => !u.archived).map(u => {
    const original = state.universes.find(old => old.id === u.id)!;
    const notes: string[] = [];
    if (actualSalary !== undefined && isCurrent) u.events = u.events.map(e => {
      if (e.kind !== "salary") return e;
      if (!e.salary || e.salary.purpose === "counterfactual") { notes.push(`${e.label}: hypothetical salary retained (counterfactual); may override actual income.`); return e; }
      if (e.salary.purpose === "additional") { notes.push(`${e.label}: explicitly additional raise retained.`); return e; }
      const fulfilled = actualSalary >= salaryTarget(e.salary);
      notes.push(`${e.label}: ${fulfilled ? "fulfilled by actual income" : `remaining conditional target ${money(salaryTarget(e.salary))}`}.`);
      return { ...e, salary: { ...e.salary, status: fulfilled ? "fulfilled" as const : "pending" as const } };
    });
    const prev = assess(before, original), next = assess(after, u);
    return { id: u.id, name: u.name, beforeViable: prev.viable, afterViable: next.viable, beforeNetWorth: prev.rows[36].netWorth, afterNetWorth: next.rows[36].netWorth, assumptions: notes };
  });
  const notices = impacts.map(i => ({ id: operationId + ":" + i.id, title: !i.beforeViable && i.afterViable ? `${i.name} is now within reach` : `${i.name} has a new outlook`, text: `${money(i.beforeNetWorth)} → ${money(i.afterNetWorth)} projected net worth in 3 years. ${i.assumptions.join(" ")}`, time: after.updatedAt, read: false, universeId: i.id }));
  const explanation = `${realized ? `${after.location} is now reality. Archived ${realized.name}. ` : "Your real financial profile is updated. "}I recalculated all ${impacts.length} active universes. ${impacts.filter(i => !i.beforeViable && i.afterViable).map(i => `${i.name} is now viable. `).join("")}Your baseline 3-year net worth changes by ${money(simulate(after)[36].netWorth - simulate(before)[36].netWorth)}. ${disclosure.join("; ")}${disclosure.length ? ". " : ""}${impacts.flatMap(i => i.assumptions).join(" ")}`;
  return { impacts, explanation, state: { ...state, profile: after, universes, notices: [...notices, ...state.notices], changes: [{ id: operationId, prompt, before, after, impacts, time: after.updatedAt }, ...state.changes], appliedOperationIds: [...(state.appliedOperationIds ?? []), operationId] } };
}
