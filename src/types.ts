export type EventKind =
  | "salary"
  | "rent"
  | "expense"
  | "income"
  | "monthly-expense"
  | "debt-payment"
  | "contribution";
export interface FinancialEvent {
  id: string;
  kind: EventKind;
  label: string;
  month: number;
  amount: number;
  estimated: boolean;
}
export interface Profile {
  name: string;
  location: string;
  startDate: string;
  checking: number;
  savings: number;
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
  id: string;
  role: "user" | "assistant";
  text: string;
}
export interface Universe {
  archived?: boolean;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  parentId?: string;
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
  prompt: string;
  before: Profile;
  after: Profile;
  time: string;
}
export interface AppState {
  version: 1;
  profile: Profile;
  universes: Universe[];
  notices: Notice[];
  changes: RealityChange[];
}
export type Mode = "create" | "modify" | "branch" | "reality";
