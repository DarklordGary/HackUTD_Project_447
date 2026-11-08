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
import { seed, makeUniverse } from "./seed";
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
  it("starts with only Main Reality and keeps settings usable without branches", () => {
    localStorage.clear();
    render(<App />);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toEqual([]);
    expect(screen.queryByRole("button", { name: "Open A New York chapter" })).toBeNull();
    expect(screen.getByText("Branches (0)")).toBeTruthy();
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
    await screen.findByText("Your real salary is updated.");
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).profile.annualSalary,
      ).toBe(90000),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes).toEqual(
      before.universes,
    );
  });

  it("applies Nemotron's branch operation from a reality-update conversation", async () => {
    render(<App />);
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    fireEvent.click(screen.getByRole("button", { name: "My Baseline" }));
    fireEvent.click(screen.getByRole("button", { name: /Update reality/ }));
    vi.mocked(fetch).mockImplementation(
      async (_url: any, options?: RequestInit) => {
        expect(JSON.parse(options!.body as string).mode).toBe("reality");
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
  it("keeps input focus inline and opens conversation after sending on narrow screens", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Hide conversation" }));
    expect(screen.queryByRole("log")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Your message to Ping"),
    );
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
    await screen.findByText(/Demo interpretation of your scenario/);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByRole("log")).getAllByText(prompt)).toHaveLength(
      1,
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes,
    ).toHaveLength(5);
  });
  it("opens a timeline, switches metrics, inspects a month, and archives/restores it", async () => {
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
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: "Archive timeline" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).universes[0].archived,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: `Open ${name}` })).toBeNull();
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }));
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: "Restore timeline" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.universes[0].archived).toBe(false);
    expect(saved.universes[0].events).toEqual(original.universes[0].events);
    expect(saved.profile).toEqual(original.profile);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
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
    fireEvent.click(screen.getByRole("button", { name: "Modify assumptions" }));
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
      screen.getByRole("heading", { name: /Your financial multiverse/ }),
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
        within(dialog).getByText(/Demo interpretation of your scenario/),
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
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Compare with original" }),
      ).toBeTruthy(),
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
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Compare with original" }),
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("HOW YOUR POSSIBILITIES CONNECT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /My Baseline/ }));
    fireEvent.click(screen.getByRole("button", { name: /Update reality/ }));
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
    expect(screen.getAllByText("Newly viable").length).toBeGreaterThan(0);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
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
          /Demo interpretation of your scenario/,
        ),
      ).toBeTruthy(),
    );
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(state.universes.at(-1).name).toBe("The open road");
    expect(state.profile.annualSalary).toBe(72000);
  });
});
