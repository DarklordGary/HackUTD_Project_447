import { z } from "zod";

export const eventSchema = z
  .object({
    kind: z.enum([
      "salary",
      "rent",
      "expense",
      "income",
      "monthly-expense",
      "debt-payment",
      "contribution",
    ]),
    label: z.string().min(1).max(150),
    month: z.number().int().min(1).max(36),
    amount: z.number().finite().min(-1000000).max(10000000),
    estimated: z.boolean(),
    replaceEventId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (e) => e.kind === "monthly-expense" || e.amount >= 0,
    "Amounts must be nonnegative except expense adjustments",
  );

export const realitySchema = z
  .object({
    annualSalary: z.number().positive().max(10000000).optional(),
    rent: z.number().nonnegative().max(100000).optional(),
    bonus: z.number().nonnegative().max(10000000).optional(),
    creditPaidOff: z.boolean().optional(),
  })
  .strict();

export const interpretationSchema = z.object({
  name: z.string().min(1).max(70),
  description: z.string().max(200),
  events: z.array(eventSchema).max(20),
  assumptions: z.array(z.string().max(250)).max(20),
  reality: realitySchema.optional(),
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
});
export const messageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(10000),
});
export const universeSchema = z.object({
  archived: z.boolean().optional(),
  id: z.string().min(1).max(100),
  name: z.string().max(70),
  description: z.string().max(200),
  createdAt: z.string().max(100),
  parentId: z.string().max(100).optional(),
  color: z.string().max(30),
  icon: z.enum(["city", "home", "sparkles", "car", "graduation"]),
  events: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        kind: z.enum([
          "salary",
          "rent",
          "expense",
          "income",
          "monthly-expense",
          "debt-payment",
          "contribution",
        ]),
        label: z.string().max(150),
        month: z.number().int().min(1).max(36),
        amount: z.number().finite().min(-1000000).max(10000000),
        estimated: z.boolean(),
      }),
    )
    .max(100),
  assumptions: z.array(z.string().max(250)).max(100),
  messages: z.array(messageSchema).max(20),
});
