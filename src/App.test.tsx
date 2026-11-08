// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { interpretDemo } from "./interpreter";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "./state";
beforeEach(() => {
  localStorage.clear();
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
          data: interpretDemo(
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
  it("opens Ping with the keyboard and restores focus when it closes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("{Control>}k{/Control}");
    expect(
      screen.getByRole("dialog", { name: "A chat with Ping" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Your message to Ping"),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Expand chat" }),
    );
  });
  it("switches between the map and list without changing saved finances", () => {
    render(<App />);
    const original = localStorage.getItem(STORAGE_KEY);
    expect(
      screen.getByLabelText("Financial multiverse branching timeline"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(
      screen.queryByLabelText("Financial multiverse branching timeline"),
    ).toBeNull();
    expect(screen.getByLabelText("Your timelines")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(
      screen.getByLabelText("Financial multiverse branching timeline"),
    ).toBeTruthy();
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
            data: interpretDemo(
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
    fireEvent.click(screen.getByRole("button", { name: "New universe" }));
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
    fireEvent.click(screen.getByRole("button", { name: "New universe" }));
    const dialog = screen.getByRole("dialog");
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
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("You’re exploring"), {
      target: { value: "modify" },
    });
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
    fireEvent.click(screen.getByRole("button", { name: "New universe" }));
    let dialog = screen.getByRole("dialog");
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
    expect(
      (within(dialog).getByLabelText("You’re exploring") as HTMLSelectElement)
        .value,
    ).toBe("branch");
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
    dialog = screen.getByRole("dialog");
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
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.profile.annualSalary).toBe(90000);
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
    fireEvent.click(screen.getByRole("button", { name: "New universe" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Your message to Ping"), {
      target: { value: "Make me rich" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Send message" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText(/I can model a move to New York/),
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
        within(screen.getByRole("dialog")).getByText(
          /Demo interpretation of your scenario/,
        ),
      ).toBeTruthy(),
    );
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(state.universes.at(-1).name).toBe("The open road");
    expect(state.profile.annualSalary).toBe(72000);
  });
});
