// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { BaselineEditor } from "./BaselineEditor";
import { usePing } from "./usePing";
import { connectPersistence } from "./sync";
import { interpret } from "./interpreter";
import { seed } from "./seed";
import { STORAGE_KEY, applyReality } from "./state";
import { currentFacts, simulate } from "./engine";

vi.mock("./sync", () => ({ connectPersistence: vi.fn() }));
vi.mock("./interpreter", () => ({ interpret: vi.fn() }));
const save = vi.fn();
beforeEach(() => {
  localStorage.clear(); save.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ai: "Nemotron" }) }));
  vi.mocked(connectPersistence).mockReturnValue({ save, close: vi.fn(), saveAccount: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("saves only changed values and converts rates from percent to decimal", () => {
  const onSave = vi.fn(), profile = seed().profile;
  render(<BaselineEditor profile={profile} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Gross annual salary"), { target: { value: "96000" } });
  fireEvent.change(screen.getByLabelText("Effective tax rate (%)"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Savings balance"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save baseline" }));
  expect(onSave).toHaveBeenCalledWith({ annualSalary: 96000, taxRate: .2, savings: 0 }, profile);
});

it("syncs edited baseline, restores it, and uses it when creating a new branch", async () => {
  const hook = renderHook(() => usePing());
  act(() => hook.result.current.saveBaseline({ checking: 2000, savings: 50000, annualSalary: 96000, taxRate: .2, rent: 1800 }, hook.result.current.profile));
  await waitFor(() => expect(save.mock.calls.at(-1)?.[0].profile.savings).toBe(50000));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profile.annualSalary).toBe(96000);
  expect(currentFacts(hook.result.current.profile).rent).toBe(1800);
  hook.unmount();
  const restored = renderHook(() => usePing());
  expect(restored.result.current.profile.savings).toBe(50000);
  vi.mocked(interpret).mockResolvedValue({ source: "Nemotron", tools: [], data: {
    operation: "create", name: "New branch", description: "A new purchase", assumptions: [],
    events: [{ kind: "expense", label: "Purchase", amount: 1000, month: 1, estimated: false }],
  } });
  await act(async () => { await restored.result.current.send("What if I spent $1000?"); });
  expect(vi.mocked(interpret).mock.calls.at(-1)?.[3]).toMatchObject({ savings: 50000, annualSalary: 96000, rent: 1800 });
  const branch = restored.result.current.state.universes.at(-1)!;
  expect(branch.name).toBe("New branch");
  expect(restored.result.current.allRows.get(branch.id)).toEqual(simulate(restored.result.current.profile, branch.events));
  expect(save.mock.calls.at(-1)?.[0].universes.at(-1).name).toBe("New branch");
});

it("rejects invalid values and stale drafts without overwriting newer changes", () => {
  const { result } = renderHook(() => usePing());
  const original = result.current.profile;
  expect(() => result.current.saveBaseline({ savings: -1 }, original)).toThrow();
  expect(result.current.profile).toBe(original);
  act(() => result.current.saveBaseline({ savings: 12345 }, original));
  expect(() => result.current.saveBaseline({ savings: 999 }, original)).toThrow(/changed while you were editing/);
  expect(result.current.profile.savings).toBe(12345);
});

it("supersedes prior actual salary and spending without changing archived snapshots", () => {
  let state = seed();
  const original = structuredClone(state.profile);
  state.universes = [{ id: "archived", name: "Past plan", description: "", createdAt: original.updatedAt, color: "green", icon: "city", events: [], assumptions: [], messages: [], archived: true, finalProfile: original }];
  state = applyReality(state, { name: "Raise", description: "", events: [], assumptions: [], reality: { annualSalary: 90000, recurring: 500 } }, "Earlier change").state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const { result } = renderHook(() => usePing());
  act(() => result.current.saveBaseline({ annualSalary: 100000, recurring: 600 }, result.current.profile));
  expect(currentFacts(result.current.profile)).toMatchObject({ annualSalary: 100000, recurring: 600 });
  expect(result.current.state.universes[0].finalProfile).toEqual(original);
});
