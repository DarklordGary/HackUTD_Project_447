// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { modelFixture } from "./model-fixtures.test-support";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "./state";
import { makeUniverse } from "./seed";
import { seedExamples as seed } from "./seed-fixtures.test-support";
beforeEach(() => {
  localStorage.clear();
  // Scenario interaction tests explicitly load existing branches; fresh users start empty.
  const workspace = seed();
  workspace.examplesVersion = 2;
  const chicago = makeUniverse("Move to Chicago", "Existing child timeline", []);
  chicago.parentId = workspace.universes[0].id;
  workspace.universes.push(chicago);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  vi.stubEnv("VITE_SPACETIMEDB_DATABASE", "");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/status")
        return { ok: true, json: async () => ({ ai: "Demo interpreter" }) };
      const body = JSON.parse(options!.body as string);
      return {
        ok: true,
        json: async () => ({
          data: modelFixture(
            body.prompt,
            body.mode,
            body.universe,
            body.profile,
          ),
          source: "Demo interpreter",
        }),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("application demo", () => {
  it("keeps horizon outcomes fixed while shortcuts, slider, chart keys and liquidity jump select one month", async () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const plan = workspace.universes[0];
    const { simulate, money } = await import("./engine");
    const { minimumLiquidity, signedMoney } = await import("./results");
    const rows = simulate(workspace.profile, plan.events);
    const baseline = simulate(workspace.profile);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Open ${plan.name}` }));
    const horizon = screen.getByRole("region", { name: "Horizon outcomes" });
    expect(within(horizon).getByText(money(rows[36].netWorth))).toBeTruthy();
    expect(within(horizon).getAllByText(`${signedMoney(rows[36].netWorth - baseline[36].netWorth)} vs Main Reality`).length).toBeGreaterThan(0);
    const fixed = horizon.textContent;
    const slider = screen.getByRole("slider", { name: "Inspect projection month" }) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "2 years" }));
    expect(slider.value).toBe("24");
    expect(screen.getByRole("heading", { name: rows[24].date })).toBeTruthy();
    fireEvent.change(slider, { target: { value: "7" } });
    expect(screen.getByRole("heading", { name: rows[7].date })).toBeTruthy();
    const chart = screen.getByRole("group", { name: /savings projections/ });
    fireEvent.mouseMove(chart, { clientX: 200 });
    expect(slider.value).toBe("7");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(slider.value).toBe("8");
    fireEvent.click(screen.getByRole("button", { name: `Jump to month ${minimumLiquidity(rows).month}` }));
    expect(slider.value).toBe(String(minimumLiquidity(rows).month));
    expect(horizon.textContent).toBe(fixed);
  });
  it("uses archived dates and omits dollar comparisons when snapshot dates differ", () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const plan = workspace.universes[0];
    plan.archived = true; plan.finalProfile = { ...workspace.profile, startDate: "2020-01-01" };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    render(<App />);
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(screen.getByText(/Branches \(/));
    fireEvent.click(screen.getByLabelText(plan.name));
    fireEvent.click(screen.getByRole("button", { name: `Open ${plan.name}` }));
    expect(screen.getByText(/Dates differ; Main Reality overlay/)).toBeTruthy();
    expect(screen.queryByText(/vs Main Reality/)).toBeNull();
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toContain("2021");
  });
  it("compares independent and missing-source timelines with Main Reality without selecting unrelated plans", () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const plan = workspace.universes[0];
    plan.revisionOfId = "missing-original";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Open ${plan.name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Compare with original" }));
    expect(screen.getByText(/original source is unavailable/)).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Main Reality")).toBeTruthy();
    expect(within(table).queryByText(workspace.universes[1].name)).toBeNull();
    expect(within(table).getByText(plan.name)).toBeTruthy();
  });
  it("exposes every same-month chart event and selects its complete group", () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const plan = workspace.universes[0];
    plan.events = Array.from({ length: 9 }, (_, i) => ({ ...plan.events[0], id: `grouped-${i}`, label: `Cost ${i}`, month: i < 3 ? 1 : i }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Open ${plan.name}` }));
    const group = screen.getByRole("button", { name: /Inspect month 1: Cost 0.*Cost 1.*Cost 2/ });
    fireEvent.keyDown(group, { key: "Enter" });
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("1");
    expect(screen.getByRole("button", { name: /Inspect month 8: Cost 8/ })).toBeTruthy();
    expect(screen.getByText(/All chart events \(9\)/)).toBeTruthy();
  });
  it("starts a new chat without deleting finances or plans, and sends no prior conversation or goal", async () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    workspace.profile.annualSalary = 80000;
    workspace.activeGoalId = workspace.universes[0].id;
    workspace.conversation = [{ id: "old-user", role: "user", text: "What about my boat?" }, { id: "old-answer", role: "assistant", text: "The earlier boat conversation." }];
    workspace.universes[0].messages = workspace.conversation;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    let view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Open ${workspace.universes[0].name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Conversation history" }));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.conversation).toEqual([]);
    expect(saved.activeGoalId).toBeUndefined();
    for (const key of ["profile", "universes", "notices", "changes"]) expect(saved[key]).toEqual(workspace[key]);
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Branch Summary" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Your message to Ping"));
    view.unmount(); view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `Open ${workspace.universes[0].name}` }));
    expect(screen.queryByText("The earlier boat conversation.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Timelines" }));
    let request: any;
    vi.mocked(fetch).mockImplementation(async (_url: any, options?: RequestInit) => {
      request = JSON.parse(options!.body as string);
      return { ok: true, json: async () => ({ source: "Nemotron", data: { name: "Conversation", description: "", events: [], assumptions: [], answer: "A fresh conversation." } }) } as Response;
    });
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "What could I save this year?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("A fresh conversation.");
    expect(request.history).toEqual([]);
    expect(request.activeGoalId).toBeUndefined();
    expect(request.universe).toBeUndefined();
    expect(request.profile.annualSalary).toBe(80000);
    expect(request.universes).toHaveLength(workspace.universes.length);
    expect(request.universes.every((u: any) => u.messages.length === 0)).toBe(true);
  });
  it("persists the original pending request across reloads and repeated clarification replies", async () => {
    const requests: any[] = [];
    vi.mocked(fetch).mockImplementation(async (url: any, options?: RequestInit) => {
      if (url === "/api/status") return { ok: true, json: async () => ({ ai: "Nemotron" }) } as Response;
      requests.push(JSON.parse(options!.body as string));
      return { ok: true, json: async () => ({ source: "Nemotron", data: { name: "Conversation", description: "", events: [], assumptions: [], clarification: requests.length === 1 ? "Which departure city?" : "How long after NY?" } }) } as Response;
    });
    let view = render(<App />);
    const prompt = "and after moving there can i move to denver";
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: prompt } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Which departure city?");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).conversation.at(-1).clarificationFor).toBe(prompt);
    view.unmount(); view = render(<App />);
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "ny" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("How long after NY?");
    expect(requests[1].history.at(-1).clarificationFor).toBe(prompt);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).conversation.at(-1).clarificationFor).toBe(prompt);
  });
  it("ignores a pending old reply after starting and sending a new chat", async () => {
    let finishOld: ((response: Response) => void) | undefined;
    let posts = 0;
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      if (url === "/api/status") return { ok: true, json: async () => ({ ai: "Nemotron" }) } as Response;
      if (++posts === 1) return new Promise<Response>(resolve => { finishOld = resolve; });
      return { ok: true, json: async () => ({ source: "Nemotron", data: { name: "Conversation", description: "", events: [], assumptions: [], answer: "Reply in the new chat." } }) } as Response;
    });
    render(<App />);
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "My actual salary is now $90,000." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "Let's discuss savings." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Reply in the new chat.");
    await act(async () => { finishOld!({ ok: true, json: async () => ({ source: "Nemotron", data: { name: "Reality", description: "", events: [], assumptions: [], operation: "reality", reality: { annualSalary: 90000 } } }) } as Response); });
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(after.profile).toEqual(before.profile);
    expect(after.universes).toEqual(before.universes);
    expect(after.conversation).toHaveLength(2);
    expect(after.conversation.at(-1).text).toBe("Reply in the new chat.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("discards a boat conversationally without replaying the prior actual raise", async () => {
    const workspace = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const boat = makeUniverse("fishing boat", "A cash purchase", [{ id: "boat-price", kind: "expense", label: "Boat", month: 1, amount: 12000, estimated: false }]);
    workspace.universes.push(boat);
    workspace.profile.annualSalary = 80000;
    workspace.activeGoalId = boat.id;
    workspace.conversation = [{ id: "prior", role: "assistant", text: "Your actual salary is now $80,000." }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    vi.mocked(fetch).mockImplementation(async (url: any) => ({ ok: true, json: async () => url === "/api/status" ? { ai: "Nemotron" } : {
      source: "Nemotron", tools: [], data: { name: "Discard plan", description: "", events: [], assumptions: [], operation: "archive", targetUniverseId: boat.id, operationId: "discard-boat" },
    } }) as Response);
    const view = render(<App />);
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "forget the boat" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/I've set aside fishing boat/);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes.find((u: any) => u.id === boat.id).archived).toBe(true));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.profile).toEqual(workspace.profile);
    expect(saved.changes).toEqual(workspace.changes);
    expect(saved.universes).toHaveLength(workspace.universes.length);
    expect(saved.universes.find((u: any) => u.id === boat.id).archived).toBe(true);
    expect(saved.activeGoalId).toBeUndefined();
    expect(saved.conversation.at(-1).text).toContain("real finances are unchanged");
    view.unmount(); render(<App />);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes.find((u: any) => u.id === boat.id).archiveReason).toBe("manual");
  });
  it("starts over from the map and ignores an old pending response after reset", async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      if (url === "/api/status") return { ok: true, json: async () => ({ ai: "Nemotron" }) } as Response;
      return new Promise<Response>(resolve => { finish = resolve; });
    });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    saved.profile.annualSalary = 112000;
    saved.conversation = [{ id: "old", role: "assistant", text: "A previous experiment" }];
    saved.activeGoalId = saved.universes[0].id;
    saved.appliedOperationIds = ["old-operation"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Conversation history" }));
    fireEvent.change(screen.getByLabelText("Your message to Ping"), { target: { value: "Can I move to New York?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByText("Ping is thinking…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep exploring" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset workspace" }));
    const reset = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(reset.universes).toEqual([]);
    expect(reset.profile.annualSalary).toBe(72000);
    expect(reset.changes).toEqual([]);
    expect(reset.conversation).toBeUndefined();
    expect(reset.activeGoalId).toBeUndefined();
    expect(reset.appliedOperationIds).toBeUndefined();
    expect(screen.queryByRole("log")).toBeNull();
    expect((screen.getByLabelText("Your message to Ping") as HTMLInputElement).value).toBe("");
    await act(async () => { finish!({ ok: true, json: async () => ({ source: "Nemotron", data: modelFixture("Can I move to New York?", "create") }) } as Response); });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(reset);
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount(); render(<App />);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toEqual([]);
    expect(screen.queryByText("A previous experiment")).toBeNull();
    expect(screen.getByRole("button", { name: "Start over" })).toBeTruthy();
  });
  it("draws new paths on the map, tucks a reply while drafting, and opens details only by choice", async () => {
    render(<App />);
    const input = screen.getByLabelText("Your message to Ping");
    fireEvent.change(input, { target: { value: "Can I move to New York?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/Here is your scenario projection/);
    expect(screen.getByLabelText("Financial multiverse branching timeline")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Branch Summary" })).toBeNull();
    await waitFor(() => expect(document.querySelector(".universe-lane.is-new")).toBeTruthy());
    fireEvent.change(input, { target: { value: "What if I got a $90,000 job two months after moving?" } });
    expect(screen.getByLabelText("Previous Ping response")).toBeTruthy();
    expect(screen.queryByRole("log")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.queryByLabelText("Previous Ping response")).toBeNull();
    expect(screen.getByText("Ping is thinking…")).toBeTruthy();
    await screen.findByRole("button", { name: "Open NYC with a new job" });
    expect(screen.queryByRole("heading", { name: "Branch Summary" })).toBeNull();
    const composer = screen.getByRole("region", { name: "Ask Ping" });
    expect(within(composer).queryByRole("button", { name: "Explore this universe" })).toBeNull();
    expect(within(composer).queryByRole("button", { name: "Compare with original" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open NYC with a new job" }));
    expect(screen.getByRole("heading", { name: "Branch Summary" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "NYC with a new job" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore this universe" })).toBeNull();
  });
  it("starts with only Main Reality and keeps settings usable without branches", () => {
    localStorage.clear();
    render(<App />);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toEqual([]);
    expect(screen.queryByRole("button", { name: "Open A New York chapter" })).toBeNull();
    expect(screen.queryByText(/^Branches \(/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare paths" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(screen.getByText("Viability rule")).toBeTruthy();
  });
  it("applies Nemotron's reality operation even when the selected context is a branch", async () => {
    render(<App />);
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    fireEvent.click(
      screen.getByRole("button", { name: "Open A New York chapter" }),
    );
    vi.mocked(fetch).mockImplementation(
      async (_url: any, options?: RequestInit) => {
        const request = JSON.parse(options!.body as string);
        expect(request.mode).toBe("branch");
        return {
          ok: true,
          json: async () => ({
            source: "Nemotron",
            tools: [],
            data: {
              name: "Reality update",
              description: "",
              events: [],
              assumptions: [],
              operation: "reality",
              reality: { annualSalary: 90000 },
              explanation: "Your real salary is updated.",
            },
          }),
        } as Response;
      },
    );
    fireEvent.change(screen.getByLabelText("Your message to Ping"), {
      target: { value: "My actual salary is now $90,000." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/Your real financial profile is updated/);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).profile.annualSalary,
      ).toBe(90000),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toEqual(
      before.universes,
    );
  });

  it("applies Nemotron's branch operation from the selected timeline composer", async () => {
    render(<App />);
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    fireEvent.click(screen.getByRole("button", { name: "Open A New York chapter" }));
    vi.mocked(fetch).mockImplementation(
      async (_url: any, options?: RequestInit) => {
        expect(JSON.parse(options!.body as string).mode).toBe("branch");
        return {
          ok: true,
          json: async () => ({
            source: "Nemotron",
            tools: [],
            data: {
              name: "An alternative",
              description: "A hypothetical job",
              events: [
                {
                  kind: "salary",
                  label: "New role",
                  month: 7,
                  amount: 90000,
                  estimated: false,
                },
              ],
              assumptions: [],
              operation: "branch",
              explicitOperations: true,
              targetUniverseId: before.universes[0].id,
              explanation: "Your alternative is ready.",
            },
          }),
        } as Response;
      },
    );
    fireEvent.change(screen.getByLabelText("Your message to Ping"), {
      target: { value: "What if I changed jobs in the New York timeline?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Your alternative is ready.");
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes,
      ).toHaveLength(before.universes.length + 1),
    );
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(after.profile).toEqual(before.profile);
    expect(after.universes.at(-1).parentId).toBe(before.universes[0].id);
    expect(after.universes[0]).toEqual(before.universes[0]);
  });
  it("keeps Settings available within mobile navigation", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 900px)",
    }));
    render(<App />);
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    fireEvent.click(
      within(navigation).getByRole("button", { name: "Settings" }),
    );
    expect(screen.getByRole("main", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Profile & connections" }),
    ).toBeTruthy();
  });
  it("shows the submitted message and loading inline until inference completes", async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      if (url === "/api/status")
        return { ok: true, json: async () => ({ ai: "Nemotron" }) } as Response;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    render(<App />);
    const input = screen.getByLabelText("Your message to Ping");
    fireEvent.focus(input);
    expect(screen.queryByRole("log")).toBeNull();
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => url !== "/api/status"),
    ).toHaveLength(0);
    fireEvent.change(input, { target: { value: "I moved to Chicago." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(screen.getByRole("log")).getByText("I moved to Chicago."),
    ).toBeTruthy();
    expect(screen.getByText("Ping is thinking…")).toBeTruthy();
    expect(
      screen
        .getByRole("region", { name: "Ask Ping" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      (
        screen.getByRole("button", {
          name: "Send message",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      finish!({
        ok: true,
        json: async () => ({
          source: "Nemotron",
          tools: [],
          data: {
            name: "Conversation",
            description: "",
            events: [],
            assumptions: [],
            answer: "Your update was received.",
          },
        }),
      } as Response);
    });
    expect(await screen.findByText("Your update was received.")).toBeTruthy();
    expect(screen.queryByText("Ping is thinking…")).toBeNull();
    expect(
      screen
        .getByRole("region", { name: "Ask Ping" })
        .getAttribute("aria-busy"),
    ).toBe("false");
  });
  it("keeps replies docked and opens history only on request on narrow screens", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 900px)",
    }));
    render(<App />);
    expect(screen.getByLabelText("Financial multiverse branching timeline")).toBeTruthy();
    fireEvent.focus(screen.getByLabelText("Your message to Ping"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(screen.getByLabelText("Your message to Ping"), {
      target: { value: "Can I move to New York?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("log")).toBeTruthy();
    await screen.findByText(/Here is your scenario projection/);
    expect(screen.queryByRole("heading", { name: "Branch Summary" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Conversation history" }));
    expect(screen.getByRole("button", { name: "Hide history" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide history" }));
    expect(screen.getByRole("log")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Ask Ping" }).classList.contains("expanded")).toBe(false);
  });

  it("updates the inline chat and application height when the on-screen keyboard opens", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 640,
      offsetTop: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    render(<App />);
    const chat = screen.getByRole("region", { name: "Ask Ping" });
    expect(chat.style.getPropertyValue("--visual-height")).toBe("640px");
    viewport.height = 320;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(chat.style.getPropertyValue("--visual-height")).toBe("320px");
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("320px");
    expect(screen.getByLabelText("Your message to Ping")).toBeTruthy();
  });
  it("filters the map with branch checkboxes and remembers the choice without changing finances", () => {
    render(<App />);
    const original = localStorage.getItem(STORAGE_KEY);
    expect(
      screen.getByRole("button", { name: "Open Move to Chicago" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText(/^Branches \(/));
    const options = screen.getByRole("group", { name: "Visible branches" });
    fireEvent.click(
      within(options).getByRole("checkbox", { name: "Move to Chicago" }),
    );
    expect(
      screen.queryByRole("button", { name: "Open Move to Chicago" }),
    ).toBeNull();
    fireEvent.click(
      within(options).getByRole("checkbox", { name: "A New York chapter" }),
    );
    fireEvent.click(
      within(options).getByRole("checkbox", { name: "Move to Chicago" }),
    );
    expect(
      screen.queryByRole("button", { name: "Open A New York chapter" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open Move to Chicago" }),
    ).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
    cleanup();
    render(<App />);
    expect(
      screen.queryByRole("button", { name: "Open A New York chapter" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open Move to Chicago" }),
    ).toBeTruthy();
  });
  it("focuses the normal input with the keyboard without opening a dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Your message to Ping"),
    );
  });
  it("uses the universe map without a view toggle or changing saved finances", () => {
    render(<App />);
    const original = localStorage.getItem(STORAGE_KEY);
    expect(
      screen.getByLabelText("Financial multiverse branching timeline"),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Timeline view" })).toBeNull();
    expect(screen.queryByRole("button", { name: "List" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Map" })).toBeNull();
    expect(screen.queryByLabelText("Your timelines")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  });
  it("preserves a failed message and retries without duplicating the conversation or timeline", async () => {
    let posts = 0;
    vi.mocked(fetch).mockImplementation(
      async (url: any, options?: RequestInit) => {
        if (url === "/api/status")
          return {
            ok: true,
            json: async () => ({ ai: "Demo interpreter" }),
          } as Response;
        posts++;
        if (posts === 1)
          return {
            ok: false,
            json: async () => ({ error: "Temporarily unavailable" }),
          } as Response;
        const input = JSON.parse(options?.body as string);
        return {
          ok: true,
          json: async () => ({
            source: "Demo interpreter",
            tools: [],
            data: modelFixture(
              input.prompt,
              input.mode,
              input.universe,
              input.profile,
            ),
          }),
        } as Response;
      },
    );
    render(<App />);
    const prompt = "Can I move to New York?";
    fireEvent.change(screen.getByLabelText("Your message to Ping"), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByLabelText("Your message to Ping") as HTMLInputElement).value,
    ).toBe(prompt);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText(/Here is your scenario projection/);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByRole("log")).getAllByText(prompt)).toHaveLength(
      1,
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes,
    ).toHaveLength(5);
  });
  it("keeps inspection controls and Ask Ping while removing manual timeline mutation actions", async () => {
    render(<App />);
    const original = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const name = original.universes[0].name;
    fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }));
    expect(
      screen.getByRole("heading", { name: "Branch Summary" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cash Flow" }));
    expect(
      screen
        .getByRole("button", { name: "Cash Flow" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Inspect projection month"), {
      target: { value: "7" },
    });
    expect(
      (screen.getByLabelText("Inspect projection month") as HTMLInputElement)
        .value,
    ).toBe("7");
    for (const name of ["Branch this timeline", "Modify assumptions", "Archive timeline", "Restore timeline", "Update reality"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText("More actions")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your message to Ping" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(original);
  });
  it("renders a live tool-backed answer without creating a universe", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockImplementation(
      async (url: any) =>
        ({
          ok: true,
          json: async () =>
            url === "/api/status"
              ? { ai: "Nemotron" }
              : {
                  source: "Nemotron",
                  tools: [
                    { tool: "get_monthly_projection", status: "ok" },
                    { tool: "answer_question", status: "ok" },
                  ],
                  data: {
                    name: "Conversation",
                    description: "",
                    events: [],
                    assumptions: [],
                    answer: "Your checking starts at $4,250 in this profile.",
                  },
                },
        }) as Response,
    );
    render(<App />);
    const original = localStorage.getItem(STORAGE_KEY);
    const dialog = screen.getByRole("region", { name: "Ask Ping" });
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "How much is in checking?" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          "Your checking starts at $4,250 in this profile.",
        ),
      ).toBeTruthy(),
    );
    expect(within(dialog).getByText("Ping used 2 tools")).toBeTruthy();
    const { conversation: _conversation, ...saved } = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toEqual(JSON.parse(original!));
    expect(_conversation).toHaveLength(2);
  });
  it("applies a live removal-only edit using the returned event ID", async () => {
    render(<App />);
    const original = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const target = original.universes[0],
      removedId = target.events[0].id;
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            source: "Nemotron",
            tools: [{ tool: "apply_preview", status: "ok" }],
            data: {
              name: target.name,
              description: target.description,
              events: [],
              assumptions: [],
              explicitOperations: true,
              operation: "modify",
              targetUniverseId: target.id,
              removeEventIds: [removedId],
              explanation:
                "I removed the moving cost and kept your other assumptions.",
            },
          }),
        }) as Response,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Open ${target.name}` }),
    );
    const dialog = screen.getByRole("region", { name: "Ask Ping" });
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: {
        value: "My employer will cover the move. Remove the moving cost.",
      },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(/I removed the moving cost/),
      ).toBeTruthy(),
    );
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.universes).toHaveLength(4);
      expect(saved.universes[0].events.map((e: any) => e.id)).not.toContain(
        removedId,
      );
      expect(saved.universes[0].events).toHaveLength(2);
      expect(saved.profile).toEqual(original.profile);
    });
  });
  it("renders seeded finances, creates and branches a universe, compares paths, and updates reality", async () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Inspect Main Reality" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /My Baseline/ }));
    expect(screen.getByText("$30,400")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Timelines/ }));
    let dialog = screen.getByRole("region", { name: "Ask Ping" });
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "Can I move to New York?" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(/Here is your scenario projection/),
      ).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes,
      ).toHaveLength(5),
    );
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.universes).toHaveLength(5);
    const originalId = saved.universes[4].id;
    const originalEvents = JSON.stringify(saved.universes[4].events);
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "What if I got a $90,000 job two months after moving?" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() => {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.universes).toHaveLength(6);
    });
    expect(saved.universes[5].parentId).toBe(originalId);
    expect(
      saved.universes[5].events.find(
        (e: { kind: string }) => e.kind === "salary",
      ).month,
    ).toBe(7);
    expect(JSON.stringify(saved.universes[4].events)).toBe(originalEvents);
    fireEvent.click(screen.getByRole("button", { name: "Open NYC with a new job" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare with original" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("HOW YOUR POSSIBILITIES CONNECT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /My Baseline/ }));
    dialog = screen.getByRole("region", { name: "Ask Ping" });
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "I got a new job paying $90,000." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(/Your real financial profile is updated/),
      ).toBeTruthy(),
    );
    await waitFor(() => {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.profile.annualSalary).toBe(90000);
    });
    expect(saved.changes[0].before.annualSalary).toBe(72000);
    expect(
      saved.universes[5].events.some(
        (e: { kind: string }) => e.kind === "salary",
      ),
    ).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "See what changed" }),
    );
    expect(screen.getByText("WITH YOUR NEW REALITY")).toBeTruthy();
    expect(screen.queryByText("Newly viable")).toBeNull();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /My Baseline/ }));
    expect(screen.getByText("$5,700")).toBeTruthy();
  });
  it("keeps the state unchanged when a request needs clarification", async () => {
    render(<App />);
    const before = localStorage.getItem(STORAGE_KEY);
    const dialog = screen.getByRole("region", { name: "Ask Ping" });
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "Make me rich" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          /What financial goal would you like to explore/,
        ),
      ).toBeTruthy(),
    );
    const { conversation: _conversation, ...saved } = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toEqual(JSON.parse(before!));
    expect(_conversation).toHaveLength(2);
  });
  it("submits a floating composer prompt directly into a new universe", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Your message to Ping"), {
      target: { value: "What if I bought a $25,000 car?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Ask Ping" })).getByText(
          /Here is your scenario projection/,
        ),
      ).toBeTruthy(),
    );
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(state.universes.at(-1).name).toBe("The open road");
    expect(state.profile.annualSalary).toBe(72000);
  });
});
