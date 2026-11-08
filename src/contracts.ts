import { z } from "zod";

export const salarySchema = z.object({
  mode: z.enum(["delta", "absolute", "percent"]).describe("delta means raise OF this many dollars; absolute means TOTAL salary OF this many dollars; percent means percentage of baseline. Example raise of $20,000 uses delta/value=20000, NOT absolute."), value: z.number().nonnegative().max(10000000),
  baseline: z.number().nonnegative().max(10000000),
  purpose: z.enum(["prerequisite", "additional", "counterfactual"]),
  status: z.enum(["pending", "fulfilled", "conflict"]).optional(),
}).strict();
export const financingSchema = z.object({
  downPayment: z.number().nonnegative(), apr: z.number().min(0).max(1),
  termMonths: z.number().int().min(1).max(600), payment: z.number().positive().optional(),
  runningCosts: z.number().nonnegative(),
}).strict();
const eventFields = {
  kind: z.enum(["salary", "rent", "expense", "income", "monthly-expense", "debt-payment", "contribution", "financed-purchase"]),
  label: z.string().min(1).max(150), month: z.number().int().min(1).max(36),
  amount: z.number().finite().min(-1000000).max(10000000), estimated: z.boolean(),
  groupId: z.string().min(1).max(100).optional(), destination: z.string().min(1).max(100).optional(),
  salary: salarySchema.optional(), financing: financingSchema.optional(),
};
export const eventSchema = z.object({ ...eventFields, replaceEventId: z.string().min(1).max(100).optional() }).strict()
  .refine(e => e.kind === "monthly-expense" || e.amount >= 0, "Amounts must be nonnegative except expense adjustments");
export const storedEventSchema = z.object({ ...eventFields, fulfilledBy: z.string().max(100).optional(), id: z.string().min(1).max(100) });

export const realitySchema = z
  .object({
    effectiveDate: z.iso.date().optional(),
    salaryChange: salarySchema.optional(),
    move: z.object({ timelineId: z.string().min(1).max(100), groupId: z.string().min(1).max(100),
      location: z.string().min(1).max(100), rent: z.number().nonnegative().optional(),
      movingCost: z.number().nonnegative().optional(), localExpense: z.number().finite().optional(),
    }).strict().optional(),
    annualSalary: z.number().positive().max(10000000).optional(),
    rent: z.number().nonnegative().max(100000).optional(),
    bonus: z.number().nonnegative().max(10000000).optional(),
    creditPaidOff: z.boolean().optional(),
  })
  .strict();

export const interpretationSchema = z.object({
  operationId: z.string().min(1).max(100).optional(),
  assessmentDate: z.iso.date().optional(),
  name: z.string().min(1).max(70),
  description: z.string().max(200),
  events: z.array(eventSchema).max(20),
  assumptions: z.array(z.string().max(250)).max(20),
  reality: realitySchema.optional(),
  operation: z.enum(["create", "branch", "modify", "reality"]).optional(),
  clarification: z.string().max(3000).optional(),
  answer: z.string().max(6000).optional(),
  explanation: z.string().max(6000).optional(),
  targetUniverseId: z.string().max(100).optional(),
  explicitOperations: z.boolean().optional(),
  removeEventIds: z.array(z.string().max(100)).max(50).optional(),
  removeAssumptions: z.array(z.string().max(250)).max(20).optional(),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

export const profileSchema = z.object({
  name: z.string().max(100),
  location: z.string().max(100),
  startDate: z.iso.date(),
  checking: z.number().finite(),
  savings: z.number().nonnegative(),
  openingAnnualSalary: z.number().nonnegative().optional(),
  openingRent: z.number().nonnegative().optional(),
  annualSalary: z.number().nonnegative().max(10000000),
  taxRate: z.number().min(0).max(1),
  rent: z.number().nonnegative(),
  recurring: z.number().nonnegative(),
  variable: z.number().nonnegative(),
  obligations: z.number().nonnegative(),
  debts: z
    .array(
      z.object({
        id: z.string().max(100),
        name: z.string().max(100),
        balance: z.number().nonnegative(),
        apr: z.number().min(0).max(1),
        payment: z.number().nonnegative(),
      }),
    )
    .max(50),
  investments: z.number().nonnegative(),
  contribution: z.number().nonnegative(),
  investmentReturn: z.number().min(-0.99).max(1),
  savingsRate: z.number().min(0).max(1),
  updatedAt: z.string().max(100),
  assessmentDate: z.iso.date().optional(),
  actualEvents: z.array(z.object({ id: z.string().max(100), effectiveDate: z.iso.date(), sourceUniverseId: z.string().max(100).optional(), location: z.string().max(100).optional(), events: z.array(storedEventSchema).max(100) })).max(100).optional(),
});
export const messageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(10000),
});
export const universeSchema = z.object({
  archived: z.boolean().optional(),
  archiveReason: z.enum(["manual", "realized"]).optional(), realizedAt: z.string().optional(),
  realityChangeId: z.string().optional(), finalProfile: profileSchema.optional(),
  id: z.string().min(1).max(100),
  name: z.string().max(70),
  description: z.string().max(200),
  createdAt: z.string().max(100),
  parentId: z.string().max(100).optional(),
  color: z.string().max(30),
  icon: z.enum(["city", "home", "sparkles", "car", "graduation"]),
  events: z.array(storedEventSchema).max(100),
  assumptions: z.array(z.string().max(250)).max(100),
  messages: z.array(messageSchema).max(20),
});

export const workspaceSchema = z.object({
  version: z.literal(1), examplesVersion: z.number().int().optional(),
  profile: profileSchema, universes: z.array(universeSchema).max(100),
  notices: z.array(z.object({ id: z.string(), title: z.string(), text: z.string(), time: z.string(), read: z.boolean(), universeId: z.string().optional() })),
  changes: z.array(z.object({ id: z.string(), prompt: z.string(), before: profileSchema, after: profileSchema, time: z.string(),
    impacts: z.array(z.object({ id: z.string(), name: z.string(), beforeViable: z.boolean(), afterViable: z.boolean(), beforeNetWorth: z.number(), afterNetWorth: z.number(), assumptions: z.array(z.string()) })).optional(),
  })),
  conversation: z.array(messageSchema).max(20).optional(), activeGoalId: z.string().optional(),
  appliedOperationIds: z.array(z.string()).optional(),
});
