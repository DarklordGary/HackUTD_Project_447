// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import TimelineCanvas, {
  layoutTimelines,
  selectMapUniverses,
} from "./TimelineCanvas";
import { seed, makeUniverse } from "./seed";

afterEach(cleanup);

function setup() {
  const state = seed();
  const onSelect = vi.fn();
  state.universes.push(
    makeUniverse("A fourth future", "Extra possibility", []),
  );
  render(
    <TimelineCanvas
      universes={selectMapUniverses(state.universes)}
      profile={state.profile}
      horizon={36}
      onSelect={onSelect}
      onReality={vi.fn()}
    />,
  );
  return { state, onSelect };
}

describe("simplified universe map", () => {
  it("draws two children from their parent and supports several event dates per child", () => {
    const { profile, universes } = seed();
    const parent = universes[0];
    const job = {
      id: "job",
      kind: "salary" as const,
      label: "New job starts",
      month: 7,
      amount: 90000,
      estimated: false,
    };
    const bonus = {
      id: "bonus",
      kind: "income" as const,
      label: "Annual bonus",
      month: 12,
      amount: 5000,
      estimated: false,
    };
    const child = {
      ...makeUniverse("NYC with a new job", "New role after moving", [
        ...parent.events,
        job,
        bonus,
      ]),
      parentId: parent.id,
    };
    const sibling = {
      ...makeUniverse("NYC with lower rent", "A smaller apartment", [
        ...parent.events,
        {
          ...job,
          id: "rent",
          kind: "rent" as const,
          label: "Lower rent starts",
          amount: 2000,
        },
      ]),
      parentId: parent.id,
    };
    const hidden = {
      ...makeUniverse("Another NYC alternative", "Available in List", []),
      parentId: parent.id,
    };
    const all = [...universes, child, sibling, hidden];
    const mapped = selectMapUniverses(all);
    expect(mapped).toHaveLength(5);
    const nodes = layoutTimelines(mapped);
    expect(
      nodes.find((node) => node.universe.id === child.id)?.parent?.universe.id,
    ).toBe(parent.id);
    expect(
      nodes.find((node) => node.universe.id === sibling.id)?.parent?.universe
        .id,
    ).toBe(parent.id);
    const onBranch = vi.fn();
    render(
      <TimelineCanvas
        universes={mapped}
        profile={profile}
        horizon={36}
        onSelect={vi.fn()}
        onReality={vi.fn()}
        onBranch={onBranch}
      />,
    );
    expect(
      screen.getByRole("button", { name: `Open ${child.name}` }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Open ${sibling.name}` }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `Open ${hidden.name}` }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`${child.name}: Make the move`),
      }),
    ).toBeNull();
    for (const label of ["New job starts", "Annual bonus"]) {
      fireEvent.pointerEnter(
        screen.getByRole("button", { name: `${child.name}: ${label}` }),
      );
      expect(
        within(screen.getByRole("region", { name: "Event details" })).getByText(
          label,
        ),
      ).toBeTruthy();
    }
    fireEvent.click(
      screen.getByRole("button", { name: `Branch ${child.name}` }),
    );
    expect(onBranch).toHaveBeenCalledWith(child);
    expect(all).toHaveLength(6);
  });
  it("limits the map to three branches without changing the saved universes", () => {
    const { state } = setup();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: "Open A fourth future" }),
    ).toBeNull();
    expect(state.universes).toHaveLength(4);
    for (const universe of state.universes.slice(0, 3)) {
      expect(screen.getByText(universe.name).getAttribute("class")).toBe(
        "branch-label",
      );
    }
  });

  it("reveals all events in a month on hover and clears details on Escape", () => {
    setup();
    expect(screen.queryByRole("region", { name: "Event details" })).toBeNull();
    expect(screen.queryByText("Make the move to NYC")).toBeNull();
    const marker = screen.getByRole("button", {
      name: /A New York chapter: Make the move/,
    });
    fireEvent.pointerEnter(marker.querySelector(".marker-dot")!);
    const details = screen.getByRole("region", { name: "Event details" });
    expect(within(details).getByText("Make the move to NYC")).toBeTruthy();
    expect(within(details).getByText("New York apartment")).toBeTruthy();
    expect(
      within(details).getByText("NYC living cost adjustment"),
    ).toBeTruthy();
    expect(within(details).getByText("$2,400/mo")).toBeTruthy();
    expect(within(details).getByText("Apr 2027")).toBeTruthy();
    fireEvent.keyDown(marker, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Event details" })).toBeNull();
  });

  it("opens the bottom branch popup outside the graph scroller", () => {
    const { state, onSelect } = setup();
    expect(
      screen.getByLabelText("Timeline in three-month intervals"),
    ).toBeTruthy();
    const marker = screen.getByRole("button", {
      name: /A place to call mine: Save an extra/,
    });
    fireEvent.pointerEnter(marker.querySelector(".marker-dot")!);
    const details = screen.getByRole("region", { name: "Event details" });
    expect(within(details).getByText("Dec 2026")).toBeTruthy();
    expect(details.closest(".timeline-scroll")).toBeNull();
    expect(details.parentElement).toBe(document.body);
    fireEvent.mouseLeave(marker.closest(".timeline-scroll")!, {
      relatedTarget: details,
    });
    expect(screen.getByRole("region", { name: "Event details" })).toBeTruthy();
    fireEvent.click(
      within(details).getByRole("button", { name: /Explore this month/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(state.universes[1], 1);
  });

  it("aligns each scheduled event to the shared calendar scale, including after a horizon change", () => {
    const { profile, universes } = seed();
    const parent = universes[0];
    const child = {
      ...makeUniverse("Chicago", "Move later", [
        ...parent.events,
        {
          id: "move",
          kind: "expense" as const,
          label: "Chicago move",
          month: 12,
          amount: 3000,
          estimated: true,
        },
        {
          id: "refund",
          kind: "income" as const,
          label: "Deposit refund",
          month: 13,
          amount: 1000,
          estimated: true,
        },
      ]),
      parentId: parent.id,
    };
    const props = {
      universes: [parent, child],
      profile,
      horizon: 36,
      onSelect: vi.fn(),
      onReality: vi.fn(),
    };
    const { rerender } = render(<TimelineCanvas {...props} />);
    const axis = screen.getByLabelText("Timeline in three-month intervals");
    expect(within(axis).getByLabelText("Feb 2027, month 3")).toBeTruthy();
    expect(within(axis).getByLabelText("Nov 2027, month 12")).toBeTruthy();
    const move = screen.getByRole("button", { name: "Chicago: Chicago move" });
    const refund = screen.getByRole("button", {
      name: "Chicago: Deposit refund",
    });
    expect(
      Number(move.querySelector(".marker-dot")!.getAttribute("cx")),
    ).toBeCloseTo(500 + (12 / 36) * 620);
    expect(
      Number(refund.querySelector(".marker-dot")!.getAttribute("cx")),
    ).toBeCloseTo(500 + (13 / 36) * 620);
    const moveHit = move.querySelector(".event-hit-area")!;
    const refundHit = refund.querySelector(".event-hit-area")!;
    expect(
      Number(moveHit.getAttribute("x")) + Number(moveHit.getAttribute("width")),
    ).toBeLessThanOrEqual(Number(refundHit.getAttribute("x")));
    rerender(<TimelineCanvas {...props} horizon={12} />);
    expect(
      Number(
        screen
          .getByRole("button", { name: "Chicago: Chicago move" })
          .querySelector(".marker-dot")!
          .getAttribute("cx"),
      ),
    ).toBe(1120);
    expect(
      screen.queryByRole("button", { name: "Chicago: Deposit refund" }),
    ).toBeNull();
  });

  it("supports focus and tap inspection before opening the correct universe month", () => {
    const { state, onSelect } = setup();
    const marker = screen.getByRole("button", {
      name: /A New York chapter: Make the move/,
    });
    fireEvent.focus(marker);
    expect(screen.getByRole("region", { name: "Event details" })).toBeTruthy();
    fireEvent.keyDown(marker, { key: "Escape" });
    fireEvent.click(marker);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Explore this month/ }));
    expect(onSelect).toHaveBeenCalledWith(state.universes[0], 5);
  });
});
