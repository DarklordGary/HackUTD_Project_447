import { minimumLiquidity } from "../src/results";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createNemotronCompletion } from "./nemotron-client";
import { z } from "zod";
import {
  eventSchema,
  interpretationSchema,
  realitySchema,
  profileCorrectionSchema,
} from "../src/contracts";
import type { Interpretation } from "../src/contracts";
import type { AppState, Message, Mode, Profile, Universe } from "../src/types";
import { assess, milestones, simulate, validateEvent, currentFacts, money, dateMonth } from "../src/engine";
import { applyReality, applyArchive, mergeAssumptions, mergeEvents, rescheduleGroup, explain } from "../src/state";

export interface AgentContext {
  operationId?: string;
  activeGoalId?: string;
  prompt: string;
  mode: Mode;
  profile: Profile;
  universes: Universe[];
  selectedUniverseId?: string;
  history: Message[];
}
export interface ToolStep {
  tool: string;
  status: "ok" | "error";
}
export interface AgentResult {
  data: Interpretation;
  source: "Nemotron";
  tools: ToolStep[];
}
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
};
const commonEvent = { label: eventSchema.shape.label, month: eventSchema.shape.month, amount: eventSchema.shape.amount, estimated: eventSchema.shape.estimated };
const variants = ["salary", "rent", "expense", "income", "living-expenses", "monthly-expense", "debt-payment", "contribution", "financed-purchase"].map(kind => z.object({
  ...commonEvent, kind: z.literal(kind),
  ...(["rent", "expense", "income", "living-expenses", "monthly-expense"].includes(kind) ? { groupId: eventSchema.shape.groupId, destination: eventSchema.shape.destination } : {}),
  ...(kind === "salary" ? { salary: eventSchema.shape.salary } : {}),
  ...(kind === "financed-purchase" ? { financing: eventSchema.shape.financing.unwrap() } : {}),
}).strict());
const additionSchema = z.union(variants);
const replacementSchema = z.union(variants.map(variant => variant.extend({ replaceEventId: z.string().min(1).max(100) })));
const changes = {
  reschedule: z.object({ groupId: z.string().min(1).max(100), delayMonths: z.number().int().min(-35).max(35) }).strict().optional().describe("Reschedule ALL linked move events together; preserves IDs and offsets. Use for waited 3 months, not a second later move."),
  timelineId: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Timeline to inherit. Defaults to the selected timeline when branching or modifying; omit when creating an independent future.",
    ),
  events: z
    .array(additionSchema)
    .max(20)
    .describe(
      "New events to ADD to the inherited history. A later move, rent or job is an addition, not a replacement.",
    ),
  replacements: z
    .array(replacementSchema)
    .max(20)
    .optional()
    .describe(
      "Only for an explicit correction or reschedule of the SAME existing event, using its exact ID. Leave empty for a later move or later new job.",
    ),
  removeEventIds: z.array(z.string().max(100)).max(50).optional(),
  assumptions: z
    .array(z.string().max(250))
    .max(20)
    .describe("Only new assumptions; label estimates."),
  removeAssumptions: z
    .array(z.string().max(250))
    .max(20)
    .optional()
    .describe(
      "Exact existing assumptions to supersede. All others are retained.",
    ),
};
const moveScenarioSchema = z.object({ destination: z.string().min(1).max(100), effectiveDate: z.iso.date().describe("Calendar date of the hypothetical move, e.g. 2027-01-01. Use the user date; the engine converts it to a month index."), rent: z.number().nonnegative().max(100000), movingCost: z.number().nonnegative().max(1000000), monthlyLivingExpenses: z.number().nonnegative().max(100000).describe("Absolute monthly destination budget in USD for utilities, food, transport, healthcare and other day-to-day spending; excludes rent and ongoing obligations. Not an additive adjustment."), costAssumptions: z.array(z.string().min(1).max(250)).min(1).max(10).describe("Disclose assumed city, household/lifestyle, estimate basis, and currency conversion if applicable; do not claim live research without a source."), name: z.string().min(1).max(70) }).strict();
const tools = {
  select_action: {
    description:
      "Choose what the CURRENT user message asks. archive_plan: stop exploring/discard/forget an existing hypothetical plan, preserving its history and all actual finances. It is plan management, not a new purchase or a salary update. realize_plan: user ACTUALLY COMPLETED a planned move, e.g. I have moved to New York; this is REQUIRED for a completed move and preserves existing actual salary. update_real_life: an actual fact, correction, or change to ANY profile field (including zero liquid assets), even when a hypothetical timeline is selected. create_alternative_from_reality: revise a plan before its original events happen (such as raise plus delaying the first move); create a separate path from Main Reality, using timelineId as the plan to revise, preserving the original. create_child_timeline: continue AFTER an existing hypothetical event, retaining that event on the path (such as a job two months after moving, or moving FROM NY TO Denver after a hypothetical NY move). A named hypothetical departure city or AFTER an existing move explicitly requests inheritance. create_independent_timeline: a standalone alternative starting from real baseline finances, including a different destination without a request to inherit the selected move. Selection alone does not request inheritance. edit_existing_timeline: explicitly correct the selected hypothetical itself. answer_question: no changes requested. ask_clarification: intent is ambiguous. Return the parent timeline ID for a child, not for an independent future.",
    schema: z
      .object({
        salaryMeaning: z.enum(["annual_increase", "annual_total", "percentage_increase", "none", "unclear"]).optional().describe("Meaning of pay in the CURRENT message: another $15k or went up BY $8k is annual_increase; a salary OF $95k is annual_total; a percentage raise is percentage_increase; annual_total for salary of ZERO / no income / unemployed; none only if no pay fact is stated."),
        effectiveTiming: z.enum(["now", "specified_date"]).optional().describe("now unless the CURRENT message explicitly supplies a different effective date. Never copy dates from a hypothetical move or earlier conversation."),
        reportedAs: z.enum(["actual", "hypothetical", "plan_management", "read_only", "unclear"]).optional().describe("How the CURRENT user presents this change, independently of previous what-ifs. A change that actually happened is actual even in an ongoing hypothetical conversation."),
        requestedChanges: z.array(z.enum(["salary", "move_timing", "move", "purchase", "rent", "bonus", "debt_payoff", "plan_status", "profile", "other"])).max(8).optional().describe("All changes explicitly requested in THIS message. A salary of 0 or no income requires salary, even alongside other profile updates. Example raise and postpone relocation includes salary AND move_timing. Do not repeat changes from earlier turns."),
        profileFields: z.array(z.enum([...Object.keys(profileCorrectionSchema.shape), "liquidAssets", "annualSalary", "rent"])).optional().describe("For actual profile facts list EVERY exact property to amend. E.g. salary 0, bills 200 and variable 75 => [annualSalary,recurring,variable]. Zero liquid assets => [liquidAssets]. Savings APR is savingsRate, NOT savings (cash balance). Investment return is investmentReturn, NOT investments (portfolio balance). Savings APR 4%, investments $500 and contribute $0 => [savingsRate,investments,contribution]. This is the completeness checklist for the update."),
        departureCity: z.string().min(1).max(100).optional().describe("For create_child_timeline with scenarioKind=move: identify the departure/anchor city from the request OR resolve there/that move using the active plan and conversation, e.g. ny for 'from ny to denver' or '2 years after I move to ny'. The parent must actually contain a move TO that city, not merely mention it in its name. NY/NYC/New York are aliases."),
        referenceSource: z.enum(["active_goal", "explicit_plan"]).optional().describe("For realization use active_goal for the discussed/current goal (default). Use explicit_plan ONLY when the current user explicitly identifies a DIFFERENT plan by exact ID/name."),
        scenarioKind: z.enum(["move", "purchase", "general"]).optional().describe("Subject is the change being requested NOW: move only for changing the relocation itself; purchase for a purchase; general for salary/job changes or questions, including a job AFTER a hypothetical move. Mentioning Seattle as context does not make a job change a move revision. Do not copy the subject from history."),
        action: z.enum([
          "update_real_life",
          "realize_plan",
          "archive_plan",
          "create_child_timeline",
          "create_alternative_from_reality",
          "create_independent_timeline",
          "edit_existing_timeline",
          "answer_question",
          "ask_clarification",
        ]),
        timelineId: z.string().max(100).optional().describe("Only an EXACT existing timeline ID from workspace context for branch/edit/reference. For create_independent_timeline OMIT this field entirely. Main Reality has no timeline ID; never invent default/current/baseline IDs."),
      })
      .strict(),
  },
  get_financial_profile: {
    description:
      "Read the existing real financial profile, baseline forecast and calculation assumptions. No data collection needed.",
    schema: z.object({}).strict(),
  },
  list_timelines: {
    description:
      "List available timeline IDs and parent-child relationships to identify relevant futures.",
    schema: z.object({}).strict(),
  },
  get_timeline: {
    description:
      "Read a timeline's exact event IDs, schedule, assumptions and calculated outlook. Read before editing or branching.",
    schema: z.object({ timelineId: z.string().max(100) }).strict(),
  },
  get_monthly_projection: {
    description:
      "Calculate any month for an existing timeline or baseline. Use for financial facts, never mental arithmetic.",
    schema: z
      .object({
        timelineId: z
          .string()
          .max(100)
          .optional()
          .describe("Omit for the real-world baseline."),
        month: z.number().int().min(0).max(36),
      })
      .strict(),
  },
  preview_followup_salary: {
    description: "A hypothetical salary/job change a stated number of months AFTER an existing plan event. Use the exact original move/rent event ID and monthsAfter; the engine calculates the month. Keeps the original move unchanged. Do not calculate the date mentally.",
    schema: z.object({ timelineId: z.string().min(1).max(100), referenceEventId: z.string().min(1).max(100), monthsAfter: z.number().int().min(0).max(35), salaryMode: z.enum(["delta", "absolute", "percent"]), salaryValue: z.number().nonnegative().max(10000000), name: z.string().min(1).max(70) }).strict(),
  },
  preview_purchase_scenario: {
    description: "Preview a cash or financed boat/vehicle purchase. For borrowing choose loan and provide downPayment, APR, term and monthly running costs. Originates a liability and never treats a boat as a location or rent change. Asset value/depreciation excluded.",
    schema: z.object({ name: z.string().min(1).max(70), month: z.number().int().min(1).max(36), price: z.number().positive().max(10000000), runningCosts: z.number().nonnegative().max(100000),
      paymentMethod: z.enum(["cash", "loan"]), downPayment: z.number().nonnegative().optional(), apr: z.number().min(0).max(1).optional(), termMonths: z.number().int().min(1).max(600).optional(),
    }).strict(),
  },
  preview_move_scenario: {
    description: "PREFERRED for exploring a new hypothetical move. Creates one linked group: rent is recurring, movingCost is one-time, monthlyLivingExpenses REPLACES uploaded recurring and variable spending with the destination budget (excluding rent, ongoing obligations, debt payments and investment contributions). Supply destination-specific amounts in USD and disclose city, budget basis and any currency conversion assumptions. Never reuse uploaded home living expenses as destination costs. For rescheduling an existing move use preview_plan_revision instead.",
    schema: moveScenarioSchema,
  },
  preview_followup_move: {
    description: "Continue an existing hypothetical path with a SECOND move, preserving the first move and all its costs. Use the original move rent event ID and monthsAfter; the engine computes the date relative to that move, not today. Convert years to months. If no interval was given, disclose an assumed interval in costAssumptions or clarify. Never use this to delay the first move.",
    schema: moveScenarioSchema.omit({ effectiveDate: true }).extend({
      timelineId: z.string().min(1).max(100),
      referenceEventId: z.string().min(1).max(100),
      monthsAfter: z.number().int().min(1).max(35),
    }).strict(),
  },
  preview_plan_revision: {
    description: "PREFERRED for a connected alternative that delays an existing move and/or changes a salary assumption. Pass only the group to reschedule and salary semantics; this tool preserves all other events and never adds a duplicate move. Use for 'raise of $20,000 and waited 3 months before moving'.",
    schema: z.object({ timelineId: z.string().min(1).max(100), groupId: z.string().min(1).max(100), delayMonths: z.number().int().min(-35).max(35),
      salaryMode: z.enum(["delta", "absolute", "percent"]).optional().describe("delta for another $15,000 annually (value=15000); absolute only for a total salary OF that amount; percent for percentage raises."), salaryValue: z.number().nonnegative().max(10000000).optional(), salaryMonth: z.number().int().min(1).max(36).optional(),
      name: z.string().min(1).max(70),
    }).strict(),
  },
  simulate_scenario: {
    description:
      "Preview a scenario using the deterministic engine without saving. Returns previewId and calculated outcomes. Preserve unrelated events. Choose create for an independent future, branch to preserve the parent, or modify for an explicitly requested edit.",
    schema: z
      .object({
        operation: z
          .enum(["create", "branch", "modify"])
          .describe(
            "Choose the action from the message and context; a selected timeline is context, not a restriction.",
          ),
        name: z.string().min(1).max(70),
        description: z.string().max(200),
        ...changes,
      })
      .strict(),
  },
  compare_timelines: {
    description:
      "Calculate side-by-side outcomes at a month. Include 'current' for the baseline.",
    schema: z
      .object({
        timelineIds: z.array(z.string().max(100)).min(2).max(5),
        month: z.number().int().min(0).max(36),
      })
      .strict(),
  },
  preview_salary_change: {
    description: "Preferred tool for an actual raise/salary change ONLY. Delta = raise OF dollars, absolute = TOTAL salary, percent = percentage increase. No move or rent changes are included.",
    schema: z.object({ mode: z.enum(["delta", "absolute", "percent"]).describe("delta means an increase BY this amount; absolute means total salary OF this amount; percent means percentage increase"), value: z.number().nonnegative().max(10000000) }).strict(),
  },
  preview_dated_salary_change: {
    description: "Actual salary change with a different effective date EXPLICITLY GIVEN in the CURRENT message. For a raise that just happened, use preview_salary_change; never reuse a date from a hypothetical move.",
    schema: z.object({ mode: z.enum(["delta", "absolute", "percent"]), value: z.number().nonnegative().max(10000000), effectiveDate: z.iso.date() }).strict(),
  },
  preview_move_realization: {
    description: "Use ONLY when the CURRENT message says a move has actually happened. Resolve exactly one existing plan and move group. Never use for a raise-only message. Omit actual amounts to reuse disclosed established estimates. Salary is never promoted from the hypothetical.",
    schema: z.object({ timelineId: z.string().min(1).max(100), groupId: z.string().min(1).max(100), location: z.string().min(1).max(100), rent: z.number().nonnegative().optional(), movingCost: z.number().nonnegative().optional(), monthlyLivingExpenses: z.number().nonnegative().optional(), localExpense: z.number().optional() }).strict(),
  },
  preview_dated_move_realization: {
    description: "Only when the CURRENT user explicitly specifies a PAST date for an actual completed move. Never use a forecast date or history date. For 'now'/'I have moved' use preview_move_realization, which uses currentDate automatically.",
    schema: z.object({ effectiveDate: z.iso.date(), move: realitySchema.shape.move.unwrap() }).strict(),
  },
  preview_reality_update: {
    description:
      "Preview an actual life update or correction to ANY user-maintained profile field reported by the user and its effects on all universes. Does not save. Debt payoff consumes cash. For a completed move provide exact timelineId and groupId in changes.move; record actual costs only, preserve actual salary, and archive only that plan. Read timelines to resolve references; clarify materially ambiguous versions. Salary changes accept delta/absolute/percent semantics, including zero salary. Other changes are absolute replacements: name, location, startDate, checking, savings, recurring (bills/subscriptions), variable, obligations, taxRate, debts (full list), investments, contribution, investmentReturn, savingsRate. Rates are decimal fractions. Preserve unmentioned fields and debt IDs/entries; use the full profile returned by select_action for partial debt edits. A corrected debt balance does not consume cash; creditPaidOff does. liquidAssets=0 clears checking and savings; for nonzero totals ask for the split. Computed totals such as net worth are derived from the underlying fields.",
    schema: z.object({ changes: realitySchema }).strict(),
  },
  resolve_plan_reference: {
    description: "Resolve the plan the CURRENT user named before archiving. referenceText must be an exact phrase from the CURRENT message (e.g. Denver, Denver Move, or boat), not a guessed timeline ID. named searches saved names/destinations and returns all matches. context is only for an explicit pronoun such as it/that plan when a real active goal exists. Multiple named matches require clarification; an active plan never overrides a named reference.",
    schema: z.object({ referenceType: z.enum(["named", "context"]), referenceText: z.string().min(1).max(150) }).strict(),
  },
  preview_archive_plan: {
    description: "Preview discarding an existing hypothetical plan. Reversibly archives exactly that timeline, keeps its history and other plans, and leaves actual finances unchanged. Use for forget the boat. Clarify if the referenced plan is ambiguous. Completed real-life moves cannot be undone this way.",
    schema: z.object({ timelineId: z.string().min(1).max(100) }).strict(),
  },
  apply_preview: {
    description:
      "Finish with a calculated preview for the app to apply and persist using the operation chosen in the preview. Explain only the preview's engine values. Call alone after a successful simulation. Cannot directly write balances.",
    schema: z
      .object({
        previewId: z.string().max(100),
        explanation: z.string().min(1).max(6000),
      })
      .strict(),
  },
  answer_question: {
    description:
      "Finish with an answer without changing data. Read financial tools first; use only their calculated amounts and distinguish assumptions.",
    schema: z.object({ answer: z.string().min(1).max(6000) }).strict(),
  },
  ask_clarification: {
    description:
      "Finish with a specific question for ambiguity, unsupported calculations that cannot be resolved from context. Makes no changes.",
    schema: z.object({ question: z.string().min(1).max(3000) }).strict(),
  },
};
type ToolName = keyof typeof tools;
const finishers = new Set<ToolName>([
  "apply_preview",
  "answer_question",
  "ask_clarification",
]);
export const toolDefinitions = Object.entries(tools).map(([name, tool]) => {
  const { $schema: _dialect, ...parameters } = z.toJSONSchema(tool.schema);
  if (name === "select_action") parameters.required = [...(parameters.required ?? []), "scenarioKind", "reportedAs", "requestedChanges", "salaryMeaning", "effectiveTiming"];
  return {
    type: "function" as const,
    function: { name, description: tool.description, parameters },
  };
});
function forecast(profile: Profile, timeline?: Universe) {
  const rows = simulate(timeline?.finalProfile ?? profile, timeline?.events),
    outlook = timeline ? assess(profile, timeline) : undefined;
  return {
    currency: "USD",
    source: "deterministic TypeScript financial engine",
    horizonMonths: 36,
    checkpoints: [0, 1, 12, 24, 36].map((m) => rows[m]),
    minimumLiquidFunds: minimumLiquidity(rows).liquid,
    minimumLiquidityMonth: minimumLiquidity(rows).month,
    minimumLiquidityDate: minimumLiquidity(rows).date,
    snapshotStartDate: (timeline?.finalProfile ?? profile).startDate,
    historicalSnapshot: !!timeline?.finalProfile,
    milestones: milestones(rows),
    firstReserveShortfall: outlook?.firstShortfall,
    shortfallBenchmark: outlook?.shortfallReserve,
    reserveBenchmarkDescription: "Three months of modeled living expenses; a comparison benchmark, not a requirement or certification.",
    assetValue: "Purchased boat/vehicle asset value and depreciation are excluded from net worth.",
    ...(outlook
      ? {
          reserveTarget: outlook.reserve,
        }
      : {}),
  };
}
/** Isolated request snapshot: only the app applies the final validated command. */
export function createToolSession(context: AgentContext) {
  const snapshot = structuredClone(context);
  const summaries = new Map<string, string>();
  const previews = new Map<string, Interpretation>(),
    observed = new Set<string>();
  let archiveResolution: { candidates: Universe[]; resolvedId?: string } | undefined;
  let readFinancialData = false;
  let validationErrors = 0;
  let selectedAction:
    { operation: Mode | "archive" | "answer" | "clarify"; timelineId?: string; action: string; scenarioKind: "move" | "purchase" | "general"; referenceSource?: "active_goal" | "explicit_plan"; requestedChanges?: string[]; profileFields?: string[]; salaryMeaning?: string; effectiveTiming?: "now" | "specified_date" } | undefined;
  function timeline(id: string) {
    const found = snapshot.universes.find((u) => u.id === id);
    if (!found) throw new Error("Unknown timeline ID. Use only exact availableTimelines IDs. Main Reality has no ID: for an independent future omit timelineId entirely. Never ask the user for app IDs.");
    return found;
  }
  const blank = (): Interpretation => ({
    name: "Conversation",
    description: "",
    events: [],
    assumptions: [],
  });
  function execute(
    name: string,
    raw: unknown,
  ): { output: unknown; final?: Interpretation } {
    if (!Object.hasOwn(tools, name)) throw new Error(`Unknown tool: ${name}`);
    const toolName = name as ToolName;
    const args = tools[toolName].schema.parse(raw);
    switch (toolName) {
      case "select_action": {
        if (selectedAction)
          throw new Error(
            "The operation is already selected for this turn. Continue with its matching tools or ask for clarification.",
          );
        const action = args as z.infer<typeof tools.select_action.schema>;
        const operations = {
          update_real_life: "reality",
          realize_plan: "reality",
          archive_plan: "archive",
          create_child_timeline: "branch",
          create_alternative_from_reality: "branch",
          create_independent_timeline: "create",
          edit_existing_timeline: "modify",
          answer_question: "answer",
          ask_clarification: "clarify",
        } as const;
        const operation = operations[action.action];
        if (action.reportedAs === "actual" && !["reality", "archive", "clarify"].includes(operation)) throw new Error("You classified the CURRENT change as actual. Choose update_real_life (or realize_plan for an actual move); a hypothetical branch cannot apply an actual fact.");
        if (action.reportedAs === "plan_management" && !["archive", "answer", "clarify"].includes(operation)) throw new Error("Plan management does not change actual finances or create a purchase. Choose archive_plan for a discarded plan, or clarify the plan reference.");
        if (action.reportedAs === "hypothetical" && operation === "answer") throw new Error("A new hypothetical affordability request needs a simulated scenario, not an uncalculated read-only answer. Use a creation/revision action. Questions about existing forecasts are read_only.");
        if (action.reportedAs === "hypothetical" && operation === "reality") throw new Error("A hypothetical change cannot update actual reality. Choose the matching scenario action.");
        if (operation === "create" && action.timelineId)
          throw new Error(
            "An independent timeline starts from Main Reality. Call select_action again with action=create_independent_timeline and OMIT timelineId. Main Reality has no timeline ID.",
          );
        let targetId = operation === "create" || operation === "archive" || action.action === "update_real_life"
          ? undefined
          : action.action === "realize_plan" && snapshot.activeGoalId && action.referenceSource !== "explicit_plan"
            ? snapshot.activeGoalId : action.timelineId ?? snapshot.activeGoalId ?? snapshot.selectedUniverseId;
        let target = targetId ? timeline(targetId) : undefined;
        if (["branch", "modify"].includes(operation) && !target)
          throw new Error(
            "Select the parent timeline ID, or choose create_independent_timeline.",
          );
        if (action.action === "create_child_timeline" && action.scenarioKind === "move" && action.departureCity) {
          const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const canonical = (value: string) => normalize(value).replace(/\b(?:new york city|nyc|ny)\b/g, "new york");
          const matches = (u: Universe) => !u.archived && u.events.some(e => e.kind === "rent" && e.destination && !e.fulfilledBy &&
            (` ${canonical(e.destination)} `).includes(` ${canonical(action.departureCity!)} `));
          if (!target || !matches(target)) {
            const candidates = snapshot.universes.filter(matches);
            if (candidates.length !== 1) throw new Error(`The selected parent does not contain a move to ${action.departureCity}. Choose by saved destinations, not names. Matching parents: ${JSON.stringify(candidates.map(u => ({ id: u.id, name: u.name })))}. If several paths match, clarify which path.`);
            // A uniquely named departure resolves the parent even when a stale active plan has a misleading title.
            target = candidates[0]; targetId = target.id;
          }
        }
        selectedAction = { operation, timelineId: targetId, action: action.action, scenarioKind: action.scenarioKind ?? "general", referenceSource: action.referenceSource, requestedChanges: action.requestedChanges, profileFields: action.profileFields, salaryMeaning: action.salaryMeaning, effectiveTiming: action.effectiveTiming };
        readFinancialData = true;
        if (targetId) observed.add(targetId);
        return {
          output: {
            operation,
            requestedChanges: action.requestedChanges,
            requiredProfileFields: action.profileFields,
            salaryMeaning: action.salaryMeaning, effectiveTiming: action.effectiveTiming,
            branchOrigin: action.action === "create_alternative_from_reality" ? "current" : targetId ?? "current",
            nextTool:
              operation === "archive" ? "resolve_plan_reference" : operation === "reality"
                ? action.action === "realize_plan" ? "preview_move_realization" : action.requestedChanges?.includes("profile") ? "preview_reality_update (only fields explicitly changed by currentRequest; omit unchanged salary and all other unchanged facts)" : "preview_salary_change (for raise) or preview_reality_update (other actual facts)"
                : action.action === "create_alternative_from_reality" ? "preview_plan_revision"
                : action.action === "create_child_timeline" && action.scenarioKind === "move" ? "preview_followup_move"
                : action.scenarioKind === "move" && ["create", "modify"].includes(operation) ? "preview_move_scenario"
                : ["create", "branch", "modify"].includes(operation)
                  ? "simulate_scenario"
                  : operation === "answer"
                    ? "answer_question"
                    : "ask_clarification",
            instruction:
              operation === "archive" ? "Resolve the exact named reference from the current message before any archive preview. A proposed ID from select_action has not been accepted as a resolved target. If several plans match, ask which one; do not choose the first or use an unrelated active plan." : "The user has already requested this action. Use its next tool; do not ask for confirmation or for existing data/IDs provided here. Preserve all other finances unless the user changed them.",
            ...(action.action === "create_child_timeline" && action.scenarioKind === "move" ? {
              previousRequest: snapshot.history.filter(m => m.role === "user").at(-1)?.text,
              previousProposalMoves: snapshot.universes.find(u => u.id === snapshot.activeGoalId)?.events
                .filter(e => e.kind === "rent" && e.destination && !e.fulfilledBy)
                .map(e => ({ destination: e.destination, month: e.month })),
              followupMoveInstruction: "Parent events identify the DEPARTURE/anchor city. The new DESTINATION is from currentRequest, or the previous request when this message only supplies timing. Do not repeat the anchor city as the new destination.",
            } : {}),
            selectedTimelineId: targetId,
            profile: snapshot.profile,
            timeline: target
              ? {
                  id: target.id,
                  name: target.name,
                  parentId: target.parentId,
                  revisionOfId: target.revisionOfId,
                  events: target.events,
                  assumptions: target.assumptions,
                }
              : null,
            note: "These are existing app facts, already read for you. Use simulation/projection tools for calculated outcomes. Keep this selected operation for the turn.",
          },
        };
      }
      case "get_financial_profile":
        readFinancialData = true;
        return {
          output: {
            profile: snapshot.profile,
            forecast: forecast(snapshot.profile),
            assumptions: {
              effectiveTaxRate: snapshot.profile.taxRate,
              annualInvestmentReturn: snapshot.profile.investmentReturn,
              savingsAPR: snapshot.profile.savingsRate,
              inflation: "Not modeled",
              reserveBenchmark:
                "Three months of modeled living expenses, for factual comparison only; not a requirement or certification.",
            },
          },
        };
      case "list_timelines":
        return {
          output: snapshot.universes.map(
            ({ id, name, description, parentId, revisionOfId, events, archived, archiveReason }) => ({
              revisionOfId,
              archived, archiveReason,
              id,
              name,
              description,
              parentId,
              eventCount: events.length,
            }),
          ),
        };
      case "get_timeline": {
        const { timelineId } = args as z.infer<
          typeof tools.get_timeline.schema
        >;
        const { messages: _history, ...found } = timeline(timelineId);
        observed.add(timelineId);
        readFinancialData = true;
        return {
          output: {
            ...found,
            forecast: forecast(snapshot.profile, timeline(timelineId)),
          },
        };
      }
      case "get_monthly_projection": {
        const { timelineId, month } = args as z.infer<
          typeof tools.get_monthly_projection.schema
        >;
        const found = timelineId ? timeline(timelineId) : undefined;
        readFinancialData = true;
        return {
          output: {
            timelineId: found?.id ?? "current",
            name: found?.name ?? "Current path",
            projection: simulate(found?.finalProfile ?? snapshot.profile, found?.events)[month],
            snapshotStartDate: (found?.finalProfile ?? snapshot.profile).startDate,
            historicalSnapshot: !!found?.finalProfile,
          },
        };
      }
      case "compare_timelines": {
        const { timelineIds, month } = args as z.infer<
          typeof tools.compare_timelines.schema
        >;
        if (new Set(timelineIds).size !== timelineIds.length)
          throw new Error("Choose distinct timelines.");
        const comparisons = timelineIds.map((id) => {
          const found = id === "current" ? undefined : timeline(id);
          return {
            id,
            name: found?.name ?? "Current path",
            projection: simulate(found?.finalProfile ?? snapshot.profile, found?.events)[month],
            snapshotStartDate: (found?.finalProfile ?? snapshot.profile).startDate,
            historicalSnapshot: !!found?.finalProfile,
          };
        });
        readFinancialData = true;
        return { output: { month, comparisons } };
      }
      case "preview_followup_salary": {
        const a = args as z.infer<typeof tools.preview_followup_salary.schema>;
        const reference = timeline(a.timelineId).events.find(e => e.id === a.referenceEventId && !e.fulfilledBy);
        if (!reference) throw new Error("Choose an exact existing, unfulfilled event ID from the timeline.");
        const month = reference.month + a.monthsAfter;
        if (month < 1 || month > 36) throw new Error("The salary change must fit inside the 36-month horizon.");
        return execute("simulate_scenario", { operation: "branch", timelineId: a.timelineId, name: a.name,
          description: "Job change after an existing plan event", assumptions: [`Job starts ${a.monthsAfter} months after ${reference.label}; the original event is unchanged.`],
          events: [{ kind: "salary", label: "Follow-up job", month, amount: a.salaryValue, estimated: false,
            salary: { mode: a.salaryMode, value: a.salaryValue, baseline: currentFacts(snapshot.profile).annualSalary, purpose: "prerequisite" } }],
        });
      }
      case "preview_purchase_scenario": {
        const a = args as z.infer<typeof tools.preview_purchase_scenario.schema>;
        if (a.paymentMethod === "loan" && (a.downPayment === undefined || a.apr === undefined || a.termMonths === undefined)) throw new Error("Loan requires explicit down payment, APR and term.");
        return execute("simulate_scenario", { operation: selectedAction?.operation, timelineId: selectedAction?.operation === "create" ? undefined : selectedAction?.timelineId,
          name: a.name, description: "Purchase; asset value and depreciation excluded", assumptions: ["Purchased asset value and depreciation are excluded from net worth."],
          events: a.paymentMethod === "loan" ? [{ kind: "financed-purchase", label: a.name, month: a.month, amount: a.price, estimated: true,
            financing: { downPayment: a.downPayment!, apr: a.apr!, termMonths: a.termMonths!, runningCosts: a.runningCosts } }]
            : [{ kind: "expense", label: a.name, month: a.month, amount: a.price, estimated: true }, { kind: "monthly-expense", label: "Purchase running costs", month: a.month, amount: a.runningCosts, estimated: true }],
        });
      }
      case "preview_followup_move": {
        const { timelineId, referenceEventId, monthsAfter, ...move } = args as z.infer<typeof tools.preview_followup_move.schema>;
        if (selectedAction?.action !== "create_child_timeline" || selectedAction.timelineId !== timelineId)
          throw new Error("A follow-up move must continue the selected parent timeline.");
        const reference = timeline(timelineId).events.find(e => e.id === referenceEventId && e.kind === "rent" && e.groupId && !e.fulfilledBy);
        if (!reference) throw new Error("Choose the exact unfulfilled rent event ID of the original move from the selected timeline.");
        const normalizeCity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\b(?:new york city|nyc|ny)\b/g, "new york");
        const departure = normalizeCity(reference.destination ?? "");
        const destination = normalizeCity(move.destination);
        if (departure && (departure.includes(destination) || destination.includes(departure)))
          throw new Error("The second move must go to a different destination from the anchor move. For a timing-only follow-up, keep the destination from the previous user request (e.g. Denver after NY), not the anchor city (NY). Reuse the original anchor event and requested interval.");
        const month = reference.month + monthsAfter;
        if (month > 36) throw new Error("The follow-up move must fit inside the 36-month horizon.");
        const [year, openingMonth] = snapshot.profile.startDate.split("-").map(Number);
        const effectiveDate = new Date(Date.UTC(year, openingMonth - 1 + month, 1)).toISOString().slice(0, 10);
        return execute("preview_move_scenario", { ...move, effectiveDate,
          costAssumptions: [...move.costAssumptions, `Second move ${monthsAfter} months after ${reference.label}; original move preserved.`].slice(-10),
        });
      }
      case "preview_move_scenario": {
        const a = args as z.infer<typeof tools.preview_move_scenario.schema>;
        const month = dateMonth(snapshot.profile, a.effectiveDate);
        if (month < 1 || month > 36) throw new Error("Hypothetical move date must be after the opening month and within 36 months. Actual completed moves use realization.");
        const groupId = `move-${snapshot.operationId ?? "preview"}-${previews.size}`;
        return execute("simulate_scenario", { operation: selectedAction?.operation, timelineId: selectedAction?.operation === "create" ? undefined : selectedAction?.timelineId, name: a.name,
          description: `Move to ${a.destination}`, assumptions: [`${a.destination}: estimated rent ${money(a.rent)}/mo; destination living budget ${money(a.monthlyLivingExpenses)}/mo replaces uploaded recurring and variable expenses. Ongoing obligations and debts remain.`, `One-time moving cost estimate: ${money(a.movingCost)}.`, ...a.costAssumptions],
          events: [
            { kind: "rent", label: `${a.destination} rent`, amount: a.rent },
            { kind: "expense", label: `${a.destination} moving cost`, amount: a.movingCost },
            { kind: "living-expenses", label: `${a.destination} monthly living expenses`, amount: a.monthlyLivingExpenses },
          ].map(e => ({ ...e, month, groupId, destination: a.destination, estimated: true })),
        });
      }
      case "preview_plan_revision": {
        const a = args as z.infer<typeof tools.preview_plan_revision.schema>;
        const hasSalary = a.salaryMode !== undefined || a.salaryValue !== undefined || a.salaryMonth !== undefined;
        if (hasSalary && (a.salaryMode === undefined || a.salaryValue === undefined || a.salaryMonth === undefined)) throw new Error("Salary revision needs mode, value and month together; omit all for timing only.");
        return execute("simulate_scenario", { operation: selectedAction?.operation, timelineId: a.timelineId, name: a.name,
          description: "Connected salary and timing alternative", assumptions: ["Salary is a prerequisite target relative to the baseline at creation."],
          reschedule: { groupId: a.groupId, delayMonths: a.delayMonths },
          events: hasSalary ? [{ kind: "salary", label: "Conditional salary", month: a.salaryMonth, amount: a.salaryValue, estimated: false,
            salary: { mode: a.salaryMode, value: a.salaryValue, baseline: currentFacts(snapshot.profile).annualSalary, purpose: "prerequisite" } }] : [],
        });
      }
      case "simulate_scenario": {
        const a = args as z.infer<typeof tools.simulate_scenario.schema>;
        if (selectedAction && selectedAction.operation !== a.operation)
          throw new Error(
            `The selected action is ${selectedAction.operation}; do not switch it to ${a.operation}. Use its matching tool or ask clarification.`,
          );
        const target =
          a.operation === "create"
            ? a.timelineId
            : (a.timelineId ??
              selectedAction?.timelineId ??
              snapshot.selectedUniverseId);
        if (a.operation === "create" && target)
          throw new Error(
            "An independent future cannot inherit a timeline. Choose branch or omit timelineId.",
          );
        if (a.operation !== "create" && !target)
          throw new Error("Choose a timeline ID to modify or branch.");
        const base = target ? timeline(target) : undefined;
        if (target && !observed.has(target))
          throw new Error("Read get_timeline before editing this timeline.");
        if (base?.archived) throw new Error("Archived plans are historical; create a new active possibility.");
        const shifted = a.reschedule ? rescheduleGroup(base?.events ?? [], a.reschedule.groupId, a.reschedule.delayMonths)
          .filter(e => e.groupId === a.reschedule!.groupId).map(({ id, ...event }) => ({ ...event, replaceEventId: id })) : [];
        const incoming: Interpretation["events"] = z.array(eventSchema).parse([
          ...shifted,
          ...a.events,
          ...(a.replacements ?? []),
        ]);
        if (selectedAction?.requestedChanges?.includes("salary") && !incoming.some(e => e.kind === "salary")) throw new Error("Incomplete preview: the selected current request includes a salary change. Include its salary semantics and effective month; do not apply only the move delay.");
        for (const event of incoming) {
          validateEvent({ ...event, id: "validation" });
          const expectedMode = { annual_increase: "delta", annual_total: "absolute", percentage_increase: "percent" }[selectedAction?.salaryMeaning ?? ""];
          if (event.kind === "salary" && expectedMode && (event.salary?.mode ?? "absolute") !== expectedMode) throw new Error(`The selected pay meaning requires salary mode=${expectedMode}; do not turn an increase into a total salary.`);
          if (event.salary?.status) throw new Error("Salary fulfillment status is computed by reality reconciliation, omit status.");
          if (event.kind === "salary" && event.groupId) throw new Error("Salary must not belong to a move group. Omit groupId and destination for salary events.");
          if (!event.replaceEventId && event.groupId && base?.events.some(old => old.groupId === event.groupId && old.kind === event.kind)) throw new Error("This move group already has that event. To delay the same move use reschedule={groupId,delayMonths}; do not add duplicate move events.");
        }
        const ids = new Set(base?.events.map((e) => e.id) ?? []);
        const replacing = incoming.flatMap((e) =>
            e.replaceEventId ? [e.replaceEventId] : [],
          ),
          removing = a.removeEventIds ?? [];
        if ([...replacing, ...removing].some((id) => !ids.has(id)))
          throw new Error(
            "Unknown event ID in replacement/removal. Read the timeline again.",
          );
        if (
          new Set([...replacing, ...removing]).size !==
          replacing.length + removing.length
        )
          throw new Error("Each event can only be changed once per preview.");
        if (a.removeAssumptions?.some((v) => !base?.assumptions.includes(v)))
          throw new Error("Only exact existing assumptions can be removed.");
        if (
          !incoming.length &&
          !removing.length &&
          !a.assumptions.length &&
          !a.removeAssumptions?.length
        )
          throw new Error("Supply at least one scenario change.");
        const data = interpretationSchema.parse({
          name: a.name,
          description: a.description,
          events: incoming,
          assumptions: a.assumptions,
          targetUniverseId: target,
          branchOrigin: selectedAction?.action === "create_alternative_from_reality" ? "current" : undefined,
          operation: a.operation,
          explicitOperations: true,
          removeEventIds: removing,
          removeAssumptions: a.removeAssumptions ?? [],
        });
        const proposed: Universe = {
          id: "preview",
          parentId: a.operation === "branch" && data.branchOrigin !== "current" ? target : undefined,
          revisionOfId: a.operation === "branch" ? target : undefined,
          name: a.name,
          description: a.description,
          createdAt: new Date().toISOString(),
          icon: base?.icon ?? "sparkles",
          color: base?.color ?? "#4e8b6c",
          events: mergeEvents(base?.events ?? [], data.events, removing, true),
          assumptions: mergeAssumptions(base?.assumptions ?? [], data),
          messages: [],
        };
        const previewId = `scenario-${previews.size + 1}`;
        previews.set(previewId, data);
        summaries.set(previewId, explain(snapshot.profile, proposed, "Nemotron") +
          proposed.events.filter(e => e.salary).map(e => ` Salary assumption: ${e.salary!.mode} ${e.salary!.value} against ${money(e.salary!.baseline)} annual gross; purpose: ${e.salary!.purpose}.`).join("") +
          proposed.events.filter(e => e.financing).map(e => ` Purchase scenario: ${money(e.amount)} price, ${money(e.financing!.downPayment)} down, ${e.financing!.apr * 100}% APR over ${e.financing!.termMonths} months, ${money(e.financing!.runningCosts)} monthly running costs.`).join("") +
          (a.reschedule ? ` The move group was shifted ${a.reschedule.delayMonths} months, preserving all linked offsets and the parent plan.` : "") +
          (proposed.events.some(e => e.financing) ? ` Purchased asset value and depreciation are excluded from net worth. Modeled debt at month 36: ${money(simulate(snapshot.profile, proposed.events)[36].debt)}; monthly cash flow: ${money(simulate(snapshot.profile, proposed.events)[36].netCashFlow)}.` : ""));
        readFinancialData = true;
        return {
          output: {
            previewId,
            operation: a.operation,
            targetUniverseId: target,
            branchOrigin: data.branchOrigin ?? target ?? "current",
            events: proposed.events,
            assumptions: proposed.assumptions,
            before: forecast(snapshot.profile, base),
            after: forecast(snapshot.profile, proposed),
            persisted: false,
          },
        };
      }
      case "preview_salary_change": {
        const a = args as z.infer<typeof tools.preview_salary_change.schema>;
        return execute("preview_reality_update", { changes: { salaryChange: { mode: a.mode, value: a.value, baseline: snapshot.profile.annualSalary, purpose: "prerequisite" } } });
      }
      case "preview_dated_salary_change": {
        const a = args as z.infer<typeof tools.preview_dated_salary_change.schema>;
        return execute("preview_reality_update", { changes: { effectiveDate: a.effectiveDate, salaryChange: { mode: a.mode, value: a.value, baseline: snapshot.profile.annualSalary, purpose: "prerequisite" } } });
      }
      case "preview_move_realization": {
        const move = args as z.infer<typeof tools.preview_move_realization.schema>;
        if (selectedAction?.action === "realize_plan" && selectedAction.timelineId && move.timelineId !== selectedAction.timelineId) throw new Error(`Use the resolved plan ID ${selectedAction.timelineId} supplied by select_action, not a sibling.`);
        return execute("preview_reality_update", { changes: { move } });
      }
      case "preview_dated_move_realization": {
        const a = args as z.infer<typeof tools.preview_dated_move_realization.schema>;
        return execute("preview_reality_update", { changes: a });
      }
      case "preview_reality_update": {
        if (selectedAction && selectedAction.operation !== "reality")
          throw new Error(
            "The selected action is hypothetical/read-only. Do not update actual reality; use its selected operation or ask clarification.",
          );
        const { changes } = args as z.infer<
          typeof tools.preview_reality_update.schema
        >;
        for (const field of selectedAction?.profileFields ?? []) {
          if (changes[field as keyof typeof changes] === undefined && !(field === "annualSalary" && changes.salaryChange)) throw new Error(`Incomplete profile update: include ${field} from the current request.`);
        }
        if (selectedAction?.profileFields?.length) {
          for (const field of [...Object.keys(profileCorrectionSchema.shape), "liquidAssets"]) {
            if (changes[field as keyof typeof changes] !== undefined && !selectedAction.profileFields.includes(field)) throw new Error(`The current request does not amend ${field}; omit unchanged profile fields.`);
          }
        }
        const requested = selectedAction?.requestedChanges;
        if (requested) {
          if ((changes.salaryChange || changes.annualSalary !== undefined) && !requested.includes("salary")) throw new Error("The current intent does not request any salary change. Do not reuse earlier salary discussion.");
          if (changes.move && !requested.includes("move")) throw new Error("The current intent does not report an actual move.");
          if (changes.rent !== undefined && !requested.includes("rent") && !requested.includes("move")) throw new Error("The current intent does not change actual rent.");
          if (changes.bonus !== undefined && !requested.includes("bonus")) throw new Error("The current intent does not report a bonus.");
          if (changes.creditPaidOff && !requested.includes("debt_payoff")) throw new Error("The current intent does not report a debt payoff.");
        }
        const expectedMode = { annual_increase: "delta", annual_total: "absolute", percentage_increase: "percent" }[selectedAction?.salaryMeaning ?? ""];
        if (expectedMode && (changes.salaryChange || changes.annualSalary !== undefined) && (changes.salaryChange?.mode ?? "absolute") !== expectedMode) throw new Error(`The selected pay meaning requires mode=${expectedMode}.`);
        if (selectedAction?.effectiveTiming === "now" && changes.effectiveDate !== undefined && changes.effectiveDate !== (snapshot.profile.assessmentDate ?? new Date().toISOString().slice(0,10))) throw new Error("The current request is effective now. Omit effectiveDate rather than copying a hypothetical date.");
        if (selectedAction?.requestedChanges?.includes("salary") && changes.salaryChange === undefined && changes.annualSalary === undefined) throw new Error("Incomplete reality preview: the current message reports a salary change. Include that change, not changes from prior turns.");
        if (changes.move && selectedAction?.action === "realize_plan") {
          if (selectedAction.timelineId && changes.move.timelineId !== selectedAction.timelineId) throw new Error(`Use the resolved plan ID ${selectedAction.timelineId}.`);
          const candidates = snapshot.universes.filter(u => !u.archived && u.events.some(e => !e.fulfilledBy && e.kind === "rent" && e.destination?.toLowerCase() === changes.move!.location.toLowerCase()));
          if (candidates.length > 1 && !snapshot.activeGoalId && !snapshot.selectedUniverseId && selectedAction.referenceSource !== "explicit_plan") throw new Error(`Ambiguous move versions: ${candidates.map(u => u.name).join(", ")}. Ask which version actually happened; do not guess.`);
        }
        if (
          !Object.entries(changes).some(
            ([k, v]) =>
              k !== "effectiveDate" && v !== undefined && (k !== "creditPaidOff" || v === true),
          )
        )
          throw new Error("No supported reality change supplied.");
        const data = interpretationSchema.parse({
          ...blank(),
          operationId: snapshot.operationId ?? crypto.randomUUID(),
          assessmentDate: snapshot.profile.assessmentDate ?? new Date().toISOString().slice(0,10),
          name: "Reality update",
          operation: "reality",
          reality: changes,
        });
        const state: AppState = {
          version: 1,
          profile: snapshot.profile,
          universes: snapshot.universes,
          notices: [],
          changes: [],
        };
        const updated = applyReality(state, data, snapshot.prompt);
        const previewId = `reality-${previews.size + 1}`;
        previews.set(previewId, data);
        summaries.set(previewId, updated.explanation);
        readFinancialData = true;
        return {
          output: {
            previewId,
            persisted: false,
            explanation: updated.explanation,
            before: forecast(snapshot.profile),
            after: forecast(updated.state.profile),
            impacts: updated.impacts,
            actualEvents: updated.state.profile.actualEvents,
            realizedPlans: updated.state.universes.filter(u => u.realityChangeId === data.operationId).map(u => ({ id: u.id, name: u.name, archiveReason: u.archiveReason })),
            timelines: snapshot.universes.filter(u => !u.archived).map((u) => ({
              id: u.id,
              name: u.name,
              before: forecast(snapshot.profile, u),
              after: forecast(updated.state.profile, updated.state.universes.find(next => next.id === u.id)),
              changes: updated.state.notices.find((n) => n.universeId === u.id)
                ?.text,
            })),
          },
        };
      }
      case "resolve_plan_reference": {
        if (selectedAction?.operation !== "archive") throw new Error("Plan-reference resolution is required for archive_plan.");
        if (previews.size) throw new Error("The archive preview is already prepared; finish that preview.");
        const { referenceType, referenceText } = args as z.infer<typeof tools.resolve_plan_reference.schema>;
        const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
        const query = normalize(referenceText);
        const contains = (text: string, phrase: string) => (` ${normalize(text)} `).includes(` ${phrase} `);
        if (!query || !contains(snapshot.prompt, query)) throw new Error("Quote the named reference from the CURRENT user message. Do not invent or borrow a different plan name from history.");
        const active = snapshot.universes.filter(u => !u.archived);
        let candidates: Universe[];
        if (referenceType === "context") {
          if (!["it", "that", "this", "that plan", "this plan", "that timeline", "this timeline", "that idea", "this idea"].includes(query)) throw new Error("Context references must quote an actual pronoun. Resolve named cities or purchases using referenceType=named.");
          const remainingWords = normalize(snapshot.prompt).split(" ").filter(word => !query.split(" ").includes(word));
          const namedElsewhere = active.some(u => remainingWords.some(word => contains(u.name, word) || u.events.some(e => e.destination && contains(e.destination, word))));
          if (namedElsewhere) throw new Error("The current message also contains a named plan reference. Use referenceType=named rather than overriding it with the active plan.");
          const focus = snapshot.activeGoalId ?? snapshot.selectedUniverseId;
          candidates = active.filter(u => u.id === focus);
          if (!candidates.length) throw new Error("There is no active plan in this new conversation. Resolve the user's named reference, or ask which saved plan they mean.");
        } else {
          const exact = active.filter(u => normalize(u.name) === query);
          const containedNames = active.filter(u => contains(query, normalize(u.name)));
          const fullNames = containedNames.filter(u => !containedNames.some(other => other.id !== u.id && contains(other.name, normalize(u.name))));
          const words = query.split(" ");
          candidates = exact.length ? exact : fullNames.length ? fullNames : active.filter(u =>
            words.some(word => contains(u.name, word) || u.events.some(e => e.destination && contains(e.destination, word)))
          );
        }
        const resolvedId = candidates.length === 1 ? candidates[0].id : undefined;
        archiveResolution = { candidates, resolvedId };
        selectedAction.timelineId = resolvedId;
        return { output: { reference: referenceText, status: resolvedId ? "resolved" : candidates.length ? "ambiguous" : "not_found",
          candidates: candidates.map(u => ({ id: u.id, name: u.name, parentId: u.parentId })), resolvedTimelineId: resolvedId,
          nextTool: resolvedId ? "preview_archive_plan" : "ask_clarification",
          question: candidates.length > 1 ? `Which plan should I set aside: ${candidates.map(u => `"${u.name}"`).join(" or ")}?` : candidates.length === 0 ? "I couldn't find a saved plan matching that reference. Which plan did you mean?" : undefined,
        } };
      }
      case "preview_archive_plan": {
        if (selectedAction?.operation !== "archive") throw new Error("Select archive_plan before previewing a discarded plan.");
        const { timelineId } = args as z.infer<typeof tools.preview_archive_plan.schema>;
        if (!archiveResolution?.resolvedId) throw new Error("Resolve the current named plan reference first. An ambiguous reference cannot be archived.");
        if (archiveResolution.resolvedId !== timelineId || selectedAction.timelineId !== timelineId) throw new Error("Use only the unique plan ID returned by resolve_plan_reference.");
        timeline(timelineId);
        const data = interpretationSchema.parse({ ...blank(), operation: "archive", targetUniverseId: timelineId, operationId: snapshot.operationId ?? crypto.randomUUID() });
        const updated = applyArchive({ version: 1, profile: snapshot.profile, universes: snapshot.universes, notices: [], changes: [], activeGoalId: snapshot.activeGoalId }, data);
        const previewId = `archive-${previews.size + 1}`;
        previews.set(previewId, data); summaries.set(previewId, updated.explanation);
        return { output: { previewId, persisted: false, explanation: updated.explanation, timelineId, archiveReason: "manual", actualFinancesChanged: false } };
      }
      case "apply_preview": {
        const { previewId, explanation } = args as z.infer<
          typeof tools.apply_preview.schema
        >;
        const preview = previews.get(previewId);
        if (!preview)
          throw new Error(
            "Unknown preview ID. Run a successful simulation first.",
          );
        return {
          output: { readyForApplication: true, previewId },
          final: interpretationSchema.parse({ ...preview, explanation: summaries.get(previewId) ?? explanation }),
        };
      }
      case "answer_question": {
        if (previews.size > 0)
          throw new Error(
            "You already simulated a requested change. Finish with apply_preview and the chosen previewId so the application can save it, or ask_clarification if the choice is ambiguous.",
          );
        if (!readFinancialData)
          throw new Error(
            "Read relevant financial tools before answering, or ask for clarification.",
          );
        const { answer } = args as z.infer<typeof tools.answer_question.schema>;
        return { output: { changed: false }, final: { ...blank(), answer } };
      }
      case "ask_clarification": {
        const { question } = args as z.infer<
          typeof tools.ask_clarification.schema
        >;
        return {
          output: { changed: false },
          final: { ...blank(), clarification: question },
        };
      }
    }
  }
  function availableTools() {
    if (!selectedAction)
      return toolDefinitions.filter(
        (tool) =>
          tool.function.name === "select_action" ||
          (validationErrors >= 2 && tool.function.name === "ask_clarification"),
      );
    const names = new Set([
      "get_financial_profile",
      "list_timelines",
      "get_timeline",
      "get_monthly_projection",
      "compare_timelines",
    ]);
    const operation = selectedAction.operation;
    if (operation === "clarify" || validationErrors >= 2)
      names.add("ask_clarification");
    if (operation === "answer") names.add("answer_question");
    if (operation === "archive") {
      names.clear();
      names.add("ask_clarification");
      if (!previews.size) names.add("resolve_plan_reference");
      if (archiveResolution?.resolvedId) names.add("preview_archive_plan");
      if (archiveResolution && !archiveResolution.candidates.length) names.add("answer_question");
    }
    if (operation === "reality") {
      if (selectedAction.action === "realize_plan") { names.add("preview_move_realization"); names.add("preview_dated_move_realization"); }
      else if (selectedAction.requestedChanges?.length === 1 && selectedAction.requestedChanges[0] === "salary") {
        names.add(selectedAction.effectiveTiming === "specified_date" ? "preview_dated_salary_change" : "preview_salary_change");
      } else { names.add("preview_reality_update"); names.add("preview_salary_change"); }
    }
    if (operation === "reality" && selectedAction.action === "update_real_life" && selectedAction.requestedChanges?.includes("profile")) {
      // select_action already returned the full real profile. A profile correction
      // needs no hypothetical-plan lookup or repeated financial reads.
      names.clear();
      names.add("preview_reality_update");
      if (validationErrors >= 2) names.add("ask_clarification");
    }
    if (["create", "branch", "modify"].includes(operation)) {
      if (selectedAction.action === "create_alternative_from_reality") {
        names.add("preview_plan_revision");
      } else if (selectedAction.action === "create_child_timeline") {
        if (selectedAction.requestedChanges?.length === 1 && selectedAction.requestedChanges[0] === "salary") names.add("preview_followup_salary");
        else if (selectedAction.scenarioKind === "move") {
          // The selected parent and profile have already been read for this preview.
          names.clear();
          names.add("preview_followup_move");
          if (validationErrors >= 2) names.add("ask_clarification");
        }
        else names.add("simulate_scenario");
        if (selectedAction.scenarioKind === "purchase") names.add("preview_purchase_scenario");
      } else if (selectedAction.scenarioKind === "move") {
        names.add("preview_move_scenario");
        if (operation === "modify") names.add("preview_plan_revision");
      } else if (selectedAction.scenarioKind === "purchase") names.add("preview_purchase_scenario");
      else names.add("simulate_scenario");
    }
    if (previews.size > 0) {
      for (const name of names) if (name.startsWith("preview_") || name === "simulate_scenario") names.delete(name);
      names.add("apply_preview");
      names.add("ask_clarification");
    }
    return toolDefinitions
      .filter((tool) => names.has(tool.function.name))
      .map((tool) => {
        if (tool.function.name === "preview_reality_update" && selectedAction?.requestedChanges) {
          const requested = selectedAction.requestedChanges;
          const parameters = structuredClone(tool.function.parameters) as any;
          const properties = parameters.properties.changes.properties;
          parameters.properties.changes.required = [...(parameters.properties.changes.required ?? []), ...(selectedAction.profileFields ?? []).filter(field => field !== "annualSalary" || selectedAction?.salaryMeaning === "annual_total")];
          for (const [field, intent] of Object.entries({ salaryChange: "salary", annualSalary: "salary", move: "move", rent: "rent", bonus: "bonus", creditPaidOff: "debt_payoff" })) {
            if (!requested.includes(intent) && !(field === "rent" && requested.includes("move"))) delete properties[field];
          }
          if (selectedAction.profileFields?.length) {
            for (const field of [...Object.keys(profileCorrectionSchema.shape), "liquidAssets"]) {
              if (!selectedAction.profileFields.includes(field)) delete properties[field];
            }
          }
          if (requested.includes("salary")) {
            if (selectedAction.salaryMeaning === "annual_total") delete properties.salaryChange;
            else if (["annual_increase", "percentage_increase"].includes(selectedAction.salaryMeaning ?? "")) delete properties.annualSalary;
          }
          return { ...tool, function: { ...tool.function, parameters } };
        }
        if (tool.function.name !== "simulate_scenario") return tool;
        const parameters = tool.function.parameters as {
          properties: Record<string, unknown>;
        };
        return {
          ...tool,
          function: {
            ...tool.function,
            parameters: {
              ...parameters,
              properties: {
                ...parameters.properties,
                operation: {
                  type: "string",
                  enum: [operation],
                  description:
                    "The action already selected for this user message.",
                },
              },
            },
          },
        };
      });
  }
  return {
    execute,
    availableTools,
    isArchiving: () => selectedAction?.operation === "archive",
    recordToolError: () => {
      validationErrors++;
    },
  };
}

const ARCHIVE_PROMPT = `You are resolving a user's request to discard a saved hypothetical plan. This phase cannot change actual finances.
First call resolve_plan_reference. Set referenceType=named and referenceText to the actual name/city/purchase phrase quoted from currentRequest: for "forget about Denver" use "Denver"; for "forget the boat" use "boat"; for "Forget Denver Move, the standalone plan" use "Denver Move". Do not copy an unrelated ID or name from the list. A fresh chat has no active goal; never default to the first plan.
If resolution is ambiguous, finish with ask_clarification using the supplied question listing the matching plans. Do not guess, choose a parent, or narrow the reference using words absent from currentRequest. If a named reference matches multiple plans, selection of an unrelated active plan does not break the tie. If status is not_found and you passed an entire instruction instead of a plan reference, retry with the actual named entity. If no matching plan exists, ask a focused clarification or acknowledge dropping the topic without claiming any archive occurred.
Only when status=resolved call preview_archive_plan with resolvedTimelineId. Then finish with apply_preview alone using the returned previewId. Preserve every other plan and all actual financial facts. No financial calculations or salary clarifications are relevant to this operation.`;

const ACTION_PROMPT = `You are Ping's intent selector. Read currentRequest in the workspace data. Classify its SPEECH ACT before considering its financial topic: conditional/wish/counterfactual requests are hypothetical; assertions about current facts, profile corrections, and changes that happened in real life are actual. Present-tense statements such as "I have 0 in liquid assets", "my savings are $500", "my rent is $900", "I have no income", and "my name is Sam" are update_real_life, never new scenarios or answer_question. No "actually" or "update my profile" wording is required. requestedChanges=[profile] covers cash balances, debts, spending, investments, identity, dates and rates; use salary/rent for those fields. Classify the current assertion independently of a selected hypothetical and prior what-ifs. A past-tense verb inside a hypothetical is still hypothetical. Never turn a "what if" salary request into an actual update merely because it says "went up".
Plan-reference resolution is mandatory for archive_plan: select_action's timelineId is only a suggestion, not authority to archive. Call resolve_plan_reference with the literal named entity from currentRequest. "forget about Denver" can match both "Denver Move" and "Seattle → Denver Move": ask which; "Seattle Move" does not match. A new chat has no active goal; never use the first listed plan as a default. An explicit full plan name can uniquely identify it, but a broad city name may match multiple plans. Do not narrow an ambiguous reference using an invented name absent from the current request.
Plan-management requests are a separate speech act. "Forget the boat", "scrap that purchase plan", or "I'm no longer considering the boat" => reportedAs=plan_management, requestedChanges=[plan_status], salaryMeaning=none, action=archive_plan with the exact boat timelineId. This neither buys a boat nor changes actual income. Resolve the named plan from availableTimelines rather than assuming the active goal if they differ. Ask which version only when genuinely ambiguous. If there is no saved matching plan and the user is dropping a topic, acknowledge it read-only without revisiting earlier salary questions.
Minimal pairs:
"My salary is 0 now, my bills and subscriptions are $200 a month, and variable spending is $75 a month." => actual, requestedChanges=[salary,profile], salaryMeaning=annual_total, update_real_life. Zero salary MUST be included; it does not mean no salary change.
"I have no income" => actual, requestedChanges=[salary], salaryMeaning=annual_total, update_real_life with salary 0.
"My salary actually went up by $8,000 a year." => actual, salary, update_real_life.
"What if my salary went up by $8,000 a year instead?" => hypothetical, salary, create_alternative_from_reality (revise the discussed assumption).
"The raise came through; I earn $8,000 more per year now." => actual, salary, update_real_life.
"Suppose the raise came through and I earned $8,000 more per year." => hypothetical, salary, an appropriate scenario action.
"I've moved to Seattle now. The delayed version happened. Keep my actual salary." => actual, requestedChanges=[move], salaryMeaning=none, action=realize_plan. KEEPING income is not a salary change. Do not repeat the earlier raise.
"Two months after that January Seattle move, what if I took a $95,000 job?" => hypothetical, requestedChanges=[salary], salaryMeaning=annual_total, scenarioKind=general, create_child_timeline. The job timing is not move_timing: the move stays in January.
Conversational references and clarification replies MUST preserve the pending request. "there", "that city", and "after moving there" refer to the active plan's destination when unambiguous; never ask the user to repeat a known city or spell it literally. "and after moving there can i move to denver" with an active NY plan => create_child_timeline, move, departureCity=ny, parent=NY plan. The departure need not be a literal substring of currentRequest.
If the previous assistant asked which departure city for a pending Denver continuation and the user replies "ny", this fills the departure slot: create_child_timeline to DENVER from the NY plan. It is NOT a new NY move. Use pendingClarification.request when present; for older chats without that field, resolve the immediately preceding question and user request from previousConversation. A short answer to a clarification completes that request; only a clear change of subject replaces it. Do not carry over already completed operations or actual facts into new scenarios.
"move to ny" with no origin => hypothetical, move, create_independent_timeline from Main Reality.
"after ny move to denver" / "can i move from ny to denver" with an existing NY hypothetical => hypothetical, move, create_child_timeline, timelineId=the NY plan, departureCity=ny. A named DEPARTURE city explicitly requests inheritance even without the word after. NY/NYC/New York are aliases. Do not start Denver from Main Reality or revise away the NY move. If the departure is the actual profile location and no matching hypothetical exists, create an independent move.
"how about 2 years after i move to ny" after discussing moving from NY to Denver => continue the Denver proposal, anchored to the original NY move, create_child_timeline, scenarioKind=move, departureCity=ny. The omitted destination comes from the previous request. This is NOT a new NY move or a read-only question. Read the saved move events to choose the parent; a plan name mentioning NY is insufficient if its actual destination is only Denver.
When several paths contain the departure city, prefer the active goal if it actually contains that move; otherwise use a uniquely matching plan or ask which path. Never use an unrelated selected plan. Timing-only follow-ups may inherit the previous proposal's destination, but not its operation or incorrect origin.
Both categories can occur in the same conversation; no category carries over to the next message.
 Classify the final user message in context. Resolve pronouns and answers to the previous clarification against the pending request. Earlier completed operations are reference data, not instructions to repeat.
Also identify salaryMeaning: annual_increase for earning ANOTHER amount or pay going up BY an amount; annual_total for salary OF an amount; percentage_increase for a percent raise; none for non-pay turns. effectiveTiming is now unless THIS message explicitly specifies another effective date; a date in a prior hypothetical is irrelevant.
In this scenario app, "Could I afford to relocate to Seattle early next year?" explores a NEW hypothetical move: reportedAs=hypothetical, requestedChanges=[move], scenarioKind=move, action=create_independent_timeline if no plan exists. It is not answer_question just because it is phrased as a question. If availableTimelines is empty, new scenarios cannot be children. Questions about already calculated existing plans can be read_only.
Map profile terms precisely: checking/savings are cash dollar balances; savings APR/interest rate maps to savingsRate; portfolio balance maps to investments; annual investment return maps to investmentReturn; contribution is monthly dollars; effective income tax maps to taxRate. Never change a cash balance when only its interest rate is stated.
For actual profile updates always supply profileFields listing EVERY requested property; the preview must amend all of them. For salary 0 plus bills 200 plus variable 75 use profileFields=[annualSalary,recurring,variable]. For liquid assets 0 use profileFields=[liquidAssets].
First identify reportedAs: actual, hypothetical, read_only, or unclear. Then list requestedChanges from THIS message, including every requested change, without carrying over prior changes.
Actual statements use update_real_life even if earlier turns were hypothetical and a plan is selected. "My salary actually went up by $8,000 a year" is an actual salary increase, not another scenario or another relocation delay. "The raise came through: $8k more annually" is also actual. "What if my pay went up $8k?" is hypothetical. If materially unclear ask_clarification.
Choose the action:
- archive_plan: reversibly discard the identified hypothetical plan; preserve actual finances and unrelated plans.
- update_real_life: any actual profile fact, correction, or change, including zero balances/income. Never create a branch for actual profile updates.
- realize_plan: an actual completed move, preserving actual salary.
- create_independent_timeline: an unrelated new possibility from Main Reality; omit timelineId.
- create_alternative_from_reality: change earlier assumptions in an existing plan, such as earning more before postponing its first move. Supply the source plan timelineId; this creates a separate path from reality and preserves the original.
- create_child_timeline: continue AFTER existing hypothetical events, such as a job two months after a planned move; supply the parent timelineId and keep that move unchanged.
- edit_existing_timeline: explicitly edit the existing plan itself.
- answer_question or ask_clarification: read-only answer or a focused clarification.
scenarioKind describes the current modification, not its setting: a job after a Seattle move is general; postponing Seattle is move; a boat is purchase. A request for a raise AND postponement includes requestedChanges=[salary,move_timing]. An actual raise following that request includes ONLY salary.
Financial data and exact app IDs are provided; never invent baseline IDs or ask the user for app IDs. Main Reality has no timelineId. Use active_goal for a discussed plan, explicit_plan only for an explicit different reference. Return select_action; do not calculate or write financial outcomes.`;

const SYSTEM_PROMPT = `You are Ping, a conversational financial scenario assistant. The final user message authorizes this turn. Earlier hypothetical choices never become actual facts by implication, and earlier changes must not be replayed. A selected universe and legacy mode are context, never restrictions on reporting actual life changes.
Actual profile statements and corrections use preview_reality_update followed by apply_preview, including "I have 0 in liquid assets" => changes={liquidAssets:0}. Use the full profile returned by select_action before partial debt edits, preserve other entries and IDs, and send the complete debts list. All profile inputs can be amended: identity/location, opening date, salary/tax rate, checking/savings, rent/bills/variable spending/obligations, debt name/balance/APR/payment, investments/contribution/return and savings APR. Rates are decimal fractions, monetary changes are absolute values unless stated otherwise. Zero is a valid value. Only include fields requested THIS turn. Do not turn a total liquid-assets update into an expense. Nonzero liquid totals with no account split require a focused clarification. Profile corrections apply now and do not realize or archive a hypothetical move; an actually completed planned move uses the realization flow. Internal history and computed values cannot be directly overwritten.
Keep the selected action for the turn and use only its offered tools. For a discarded plan first resolve_plan_reference using a verbatim named reference from the current request, then preview_archive_plan only if uniquely resolved, then apply_preview. If multiple plans match, ask the provided clarification and do not archive anything; do not ask about unrelated previous financial inputs. Actual salary reports use preview_salary_change, then apply_preview. Delta means an annual gross increase; absolute means a total annual salary; percent uses a stated baseline. "My salary actually went up by $8,000 a year" means an actual delta of 8000. Do not repeat an earlier move delay. Actual moves use preview_move_realization (now by default) or preview_dated_move_realization for an explicitly stated past date. Resolve one plan, prefer the durable active goal, clarify genuinely ambiguous versions, and never promote its hypothetical salary.
For a revised move plan use preview_plan_revision. Include EVERY change in the current request. If the user asks for higher pay and a delay, include salaryMode, salaryValue AND salaryMonth as well as delayMonths. If a material date is unspecified, disclose a reasonable scenario assumption or clarify; do not silently omit the raise. Calendar months are indexed from the profile's opening month (month 0); use tools for dates and calculations. For a child job after a move use preview_followup_salary with the original event ID and monthsAfter, so the tool computes its exact month. A child continuing after a move adds its later job without rescheduling the existing move. Unrelated new possibilities start from actual reality even when another plan is selected. A shared destination alone is not a financial merge. A departure city (from NY to Denver) or after-NY sequence DOES request inheritance: use create_child_timeline and preview_followup_move. Preserve the first move; add the second move as a new group. Resolve abbreviations NY/NYC/New York as the same place using the saved destinations. For an elliptical follow-up such as "how about 2 years after I move to NY" after discussing Denver, the destination is still Denver and the anchor is the NY move; use monthsAfter=24, not a date two years from today. Use the original NY-only plan as parent if the selected Denver alternative does not contain the NY events.
For relocation questions such as "Can I move to Japan?", use a destination-specific rent and full monthly living budget, never the uploaded home spending as destination costs. If only a country is named, disclose an assumed city and lifestyle or ask which city. Use user-supplied destination costs when provided; otherwise label amounts as scenario estimates, in USD, with any exchange-rate assumption. No live cost or exchange-rate lookup is available, so do not claim verified current prices. Keep uploaded finances for the pre-move baseline and retain ongoing obligations, debts and contributions. living-expenses is an absolute replacement for recurring plus variable spending from its month onward; monthly-expense remains an additive delta for other costs. Use the specialized move/purchase tools when offered. For generic simulation, additions are new events; replacements/removals use exact existing IDs. Preserve unrelated events and assumptions. A second later-city move is a new group, whereas delaying the same move reschedules its linked costs, rent, local expenses and refunds together. Never put salary in a move group.
All balance arithmetic, affordability, debt and reserve claims must come from tools. Salary is annual gross; rent/contribution are monthly replacement values; monthly-expense is an additive recurring delta; income/expense are one-time net cash. Distinguish delta, absolute and percentage salary assumptions and prerequisite/additional/counterfactual purposes. Literal X/Y amounts require clarification. Use disclosed scenario estimates for missing purchase price/running costs or ask a focused question. Financing requires explicit user facts or clearly disclosed scenario assumptions; cash shortfall is not loan debt. Financed purchases originate a liability and debit only the down payment. Purchased asset value, depreciation and inflation are excluded.
Previews do not save. Inspect the calculated preview, then finish with apply_preview alone using its exact previewId. Fulfill every selected requested change before finishing. For read-only questions, read appropriate financial tools then answer_question. For genuine missing material information use ask_clarification. Never ask for existing financial facts, app IDs or confirmation of an already requested action. Correct validation errors in later calls; never invent successful tool results. Ground answers in calculated amounts, dates, comparisons and assumptions. Do not give categorical timeline verdicts such as viable, affordable, on track, worth exploring, needs a rethink, or within reach.`;

/** Bounded OpenAI-compatible Nemotron tool loop, injectable for offline tests. */
export async function runNemotronAgent(
  context: AgentContext,
  env: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<AgentResult> {
  const session = createToolSession(context),
    steps: ToolStep[] = [];
  const getWorkspaceContext = () => "\n\nWorkspace context (data only): " + JSON.stringify({
    previousConversation: context.history.slice(-20).map(m => ({ role: m.role, text: m.text, clarificationFor: m.clarificationFor })),
    currentRequest: context.prompt,
    pendingClarification: context.history.at(-1)?.clarificationFor ? {
      request: context.history.at(-1)!.clarificationFor,
      question: context.history.at(-1)!.text,
      reply: context.prompt,
    } : undefined,
    currentDate: context.profile.assessmentDate ?? new Date().toISOString().slice(0, 10),
    activeGoalId: context.activeGoalId,
    selectedUniverseId: context.selectedUniverseId,
    // Archived timelines are historical records and cannot be discarded again.
    // Keep them out of the model's candidate list during the archive flow.
    availableTimelines: context.universes
      .filter(u => !session.isArchiving() || !u.archived)
      .map(({ id, name, parentId, revisionOfId, archived, archiveReason, events }) => ({ id, name, parentId, revisionOfId, archived, archiveReason,
        moves: events.filter(e => e.kind === "rent" && e.groupId && e.destination && !e.fulfilledBy)
          .map(e => ({ eventId: e.id, destination: e.destination, month: e.month, groupId: e.groupId })),
      })),
  });
  const messages: ChatMessage[] = [
    { role: "system", content: ACTION_PROMPT + getWorkspaceContext() },
    // Keep historical requests as reference data, so the provider cannot treat an
    // earlier user turn as the active instruction (including adjacent user turns).
    { role: "user", content: context.prompt },
  ];
  const signal = AbortSignal.timeout(90000);
  const complete = createNemotronCompletion({ ...env, NEMOTRON_TURN_ID: context.operationId ?? crypto.randomUUID() }, fetcher);
  for (let round = 0; round < 8; round++) {
    const availableTools = session.availableTools();
    messages[0].content = (availableTools.some(t => t.function.name === "select_action") ? ACTION_PROMPT : session.isArchiving() ? ARCHIVE_PROMPT : SYSTEM_PROMPT) + getWorkspaceContext();
    const raw = await complete(messages as ChatCompletionMessageParam[], {
      tools: availableTools,
      toolChoice: "required",
      signal,
    });
    const calls = z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          type: z.literal("function"),
          function: z.object({
            name: z.string().max(100),
            arguments: z.string().max(50000),
          }),
        }),
      )
      .max(6)
      .parse(raw.tool_calls ?? []);
    if (new Set(calls.map((c) => c.id)).size !== calls.length)
      throw new Error("Duplicate tool call IDs.");
    messages.push({
      role: "assistant",
      content: typeof raw.content === "string" ? raw.content : null,
      ...(typeof raw.reasoning_content === "string"
        ? { reasoning_content: raw.reasoning_content }
        : {}),
      ...(calls.length ? { tool_calls: calls } : {}),
    });
    if (!calls.length) {
      messages.push({
        role: "system",
        content:
          "Complete this turn using the appropriate tools and exactly one finishing tool. No changes have been applied.",
      });
      continue;
    }
    if (steps.length + calls.length > 24)
      throw new Error(
        "Tool-call limit reached. No changes applied. Narrow your request.",
      );
    for (const call of calls) {
      try {
        if (calls.length > 1 && finishers.has(call.function.name as ToolName))
          throw new Error(
            "Use this finishing tool alone in a later call, after inspecting results.",
          );
        if (
          !availableTools.some(
            (tool) => tool.function.name === call.function.name,
          )
        )
          throw new Error(
            "Tool not available in this phase. First select_action, then use the selected operation's tools.",
          );
        const result = session.execute(
          call.function.name,
          JSON.parse(call.function.arguments),
        );
        steps.push({ tool: call.function.name, status: "ok" });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.output),
        });
        if (result.final)
          return { data: result.final, source: "Nemotron", tools: steps };
      } catch (error) {
        const detail =
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : error instanceof Error
              ? error.message
              : "Invalid tool call";
        session.recordToolError();
        steps.push({ tool: call.function.name, status: "error" });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: detail, changed: false }),
        });
      }
    }
  }
  throw new Error(
    "Reasoning limit reached. No changes applied. Try a more specific request.",
  );
}
