export type EventKind =
  | "salary"
  | "rent"
  | "expense"
  | "income"
  | "recurring"
  | "variable"
  | "living-expenses"
  | "monthly-expense"
  | "debt-payment"
  | "contribution"
  | "financed-purchase";
export interface FinancialEvent {
  id: string;
  kind: EventKind;
  label: string;
  month: number;
  amount: number;
  estimated: boolean;
  groupId?: string;
  destination?: string;
  salary?: { mode: "delta" | "absolute" | "percent"; value: number; baseline: number; purpose: "prerequisite" | "additional" | "counterfactual"; status?: "pending" | "fulfilled" | "conflict" };
  financing?: { downPayment: number; apr: number; termMonths: number; payment?: number; runningCosts: number };
  fulfilledBy?: string;
}
export interface Profile {
  name: string;
  location: string;
  startDate: string;
  checking: number;
  savings: number;
  openingAnnualSalary?: number;
  openingRent?: number;
  annualSalary: number;
  taxRate: number;
  rent: number;
  recurring: number;
  variable: number;
  obligations: number;
  debts: {
    id: string;
    name: string;
    balance: number;
    apr: number;
    payment: number;
  }[];
  investments: number;
  contribution: number;
  investmentReturn: number;
  savingsRate: number;
  updatedAt: string;
  assessmentDate?: string;
  actualEvents?: { id: string; effectiveDate: string; sourceUniverseId?: string; location?: string; events: FinancialEvent[] }[];
}
export interface Projection {
  month: number;
  date: string;
  income: number;
  expenses: number;
  debtPayments: number;
  investmentContribution: number;
  investmentGrowth: number;
  netCashFlow: number;
  checking: number;
  savings: number;
  debt: number;
  investments: number;
  netWorth: number;
  liquid: number;
}
export interface Message {
  clarificationFor?: string;
  id: string;
  role: "user" | "assistant";
  text: string;
}
export interface Universe {
  archived?: boolean;
  archiveReason?: "manual" | "realized";
  realizedAt?: string;
  realityChangeId?: string;
  finalProfile?: Profile;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  parentId?: string;
  revisionOfId?: string;
  color: string;
  icon: "city" | "home" | "sparkles" | "car" | "graduation";
  events: FinancialEvent[];
  assumptions: string[];
  messages: Message[];
}
export interface Notice {
  id: string;
  title: string;
  text: string;
  time: string;
  read: boolean;
  universeId?: string;
}
export interface RealityChange {
  id: string;
  impacts?: { id: string; name: string; beforeViable: boolean; afterViable: boolean; beforeNetWorth: number; afterNetWorth: number; assumptions: string[] }[];
  prompt: string;
  before: Profile;
  after: Profile;
  time: string;
}
export interface AppState {
  version: 1;
  examplesVersion?: number;
  profile: Profile;
  universes: Universe[];
  notices: Notice[];
  changes: RealityChange[];
  conversation?: Message[];
  activeGoalId?: string;
  appliedOperationIds?: string[];
}
export type Mode = "create" | "modify" | "branch" | "reality";
