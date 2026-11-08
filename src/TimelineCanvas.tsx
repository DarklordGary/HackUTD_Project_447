import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile, Universe } from "./types";
import { monthLabel, money, eventAmountLabel } from "./engine";

interface Lane {
  universe: Universe;
  lane: number;
  fork: number;
  duration: number;
  parent?: Lane;
}
function financialKey(e: Universe["events"][number]) {
  return `${e.kind}:${e.month}:${e.amount}:${e.fulfilledBy ?? ""}:${JSON.stringify(e.salary ?? e.financing ?? null)}`;
}
/** Lane relationships come from parent IDs. Curves begin three months before the first changed event. */
export function layoutTimelines(universes: Universe[]) {
  const nodes = new Map<string, Lane>();
  const ordered: Lane[] = [];
  let positive = 0,
    negative = 0;
  function visit(universe: Universe, ancestry: Set<string>): Lane | undefined {
    if (nodes.has(universe.id)) return nodes.get(universe.id);
    if (ancestry.has(universe.id)) return undefined;
    const next = new Set(ancestry).add(universe.id);
    const parentUniverse = universes.find((u) => u.id === universe.parentId);
    const parent = parentUniverse ? visit(parentUniverse, next) : undefined;
    const old = new Map(parentUniverse?.events.map((e) => [e.id, e]) ?? []);
    const events = new Map(universe.events.map((e) => [e.id, e]));
    const differences = [
      ...universe.events
        .filter(
          (e) =>
            !old.has(e.id) || financialKey(old.get(e.id)!) !== financialKey(e),
        )
        .map((e) => e.month),
      ...[...old.values()]
        .filter(
          (e) =>
            !events.has(e.id) ||
            financialKey(events.get(e.id)!) !== financialKey(e),
        )
        .map((e) => e.month),
    ];
    const side = parent
      ? Math.sign(parent.lane)
      : ordered.filter((n) => !n.parent).length % 2 === 0
        ? -1
        : 1;
    const lane = side < 0 ? --negative : ++positive;
    const firstChange = differences.length
      ? Math.min(...differences)
      : (parent?.fork ?? 1) + 3;
    const fork = Math.max(0, Math.min(36, firstChange - 3));
    const node = {
      universe,
      lane,
      fork,
      duration: Math.max(1, Math.min(3, firstChange - fork)),
      parent,
    };
    nodes.set(universe.id, node);
    ordered.push(node);
    return node;
  }
  universes.forEach((u) => visit(u, new Set()));
  return ordered;
}
/** Keep three root futures visible, with up to two children per displayed parent. */
export function selectMapUniverses(universes: Universe[]) {
  const available = new Set(universes.map((universe) => universe.id));
  const selected: Universe[] = [];
  const visited = new Set<string>();
  function include(universe: Universe) {
    if (visited.has(universe.id)) return;
    visited.add(universe.id);
    selected.push(universe);
    universes
      .filter((child) => child.parentId === universe.id)
      .slice(0, 2)
      .forEach(include);
  }
  universes
    .filter(
      (universe) => !universe.parentId || !available.has(universe.parentId),
    )
    .slice(0, 3)
    .forEach(include);
  return selected;
}

function mapEvents(node: Lane) {
  const inherited = new Map(
    node.parent?.universe.events.map((event) => [
      event.id,
      financialKey(event),
    ]) ?? [],
  );
  return node.universe.events.filter(
    (event) => !event.fulfilledBy && event.salary?.status !== "fulfilled" && inherited.get(event.id) !== financialKey(event),
  );
}

export default function TimelineCanvas({
  universes,
  profile,
  horizon,
  onSelect,
  onReality,
  onBranch,
  colorUniverses,
}: {
  universes: Universe[];
  profile: Profile;
  horizon: number;
  onSelect: (u: Universe, month?: number) => void;
  onReality: () => void;
  onBranch?: (universe: Universe) => void;
  colorUniverses?: Universe[];
}) {
  const lanes = useMemo(() => layoutTimelines(universes), [universes]);
  const colorLanes = useMemo(
    () => layoutTimelines(colorUniverses ?? universes),
    [colorUniverses, universes],
  );
  function laneColor(node: Lane) {
    node =
      colorLanes.find((lane) => lane.universe.id === node.universe.id) ?? node;
    let root = node;
    while (root.parent) root = root.parent;
    const palette = [
      ["#537e6a", "#739985", "#3e6455"],
      ["#8b7897", "#9b8aa5", "#70607a"],
      ["#a17d46", "#b39562", "#856539"],
    ];
    const family =
      Math.max(0, colorLanes.filter((lane) => !lane.parent).indexOf(root)) % 3;
    if (!node.parent) return palette[family][0];
    const sibling = colorLanes
      .filter((lane) => lane.parent === node.parent)
      .indexOf(node);
    return palette[family][1 + (sibling % 2)];
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    id: string;
    month: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!selection) return;
    const position = () => {
      const dot = rootRef.current?.querySelector(
        '.event-marker[aria-expanded="true"] .marker-dot',
      );
      const popover = popoverRef.current;
      if (!dot || !popover) return;
      const anchor = dot.getBoundingClientRect();
      const box = popover.getBoundingClientRect();
      const margin = 12;
      const below = anchor.bottom + 16;
      const top =
        below + box.height <= window.innerHeight - margin
          ? below
          : anchor.top - box.height - 16;
      setPopoverPosition({
        left: Math.max(
          margin,
          Math.min(
            window.innerWidth - box.width - margin,
            anchor.left + anchor.width / 2 - box.width / 2,
          ),
        ),
        top: Math.max(
          margin,
          Math.min(window.innerHeight - box.height - margin, top),
        ),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [selection, horizon, profile, universes]);
  function containsTarget(target: EventTarget | null) {
    return (
      target instanceof Node &&
      (rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target))
    );
  }
  const lowest = Math.min(-1, ...lanes.map((n) => n.lane));
  const highest = Math.max(1, ...lanes.map((n) => n.lane));
  const gap = 188,
    baselineY = 72 - lowest * gap;
  const height = Math.max(540, (highest - lowest) * gap + 224);
  const start = 24,
    end = 930;
  // Keep a quiet lead-in for the context and forks; event dates share one linear scale.
  const timeStart = 120;
  const timeX = (month: number) =>
    timeStart + (month / horizon) * (end - timeStart);
  const axisY = height - 64;
  const tickStep = horizon > 18 ? 6 : 3;
  const ticks = Array.from(
    { length: Math.floor(horizon / tickStep) + 1 },
    (_, index) => index * tickStep,
  );
  const geometry = new Map<
    string,
    { fromX: number; fromY: number; toX: number; toY: number }
  >();
  for (const lane of lanes) {
    const parent = lane.parent
      ? geometry.get(lane.parent.universe.id)
      : undefined;
    const fromX = Math.min(
      720,
      Math.max(
        start + 170 + (lane.fork / horizon) * 220,
        parent ? parent.toX + 60 : 0,
      ),
    );
    geometry.set(lane.universe.id, {
      fromX,
      fromY: lane.parent ? routeY(lane.parent, fromX) : baselineY,
      toX: Math.min(end - 230, fromX + 220),
      toY: baselineY + lane.lane * gap,
    });
  }
  function routeY(lane: Lane, pointX: number): number {
    const route = geometry.get(lane.universe.id)!;
    if (pointX < route.fromX)
      return lane.parent ? routeY(lane.parent, pointX) : baselineY;
    if (pointX >= route.toX) return route.toY;
    const dx = route.toX - route.fromX;
    let low = 0,
      high = 1;
    for (let i = 0; i < 24; i++) {
      const t = (low + high) / 2;
      const curveX =
        route.fromX +
        dx *
          (3 * (1 - t) ** 2 * t * 0.45 + 3 * (1 - t) * t * t * 0.55 + t ** 3);
      if (curveX < pointX) low = t;
      else high = t;
    }
    const t = (low + high) / 2;
    return route.fromY + (route.toY - route.fromY) * t * t * (3 - 2 * t);
  }
  function eventY(lane: Lane, month: number) {
    return routeY(lane, timeX(month));
  }
  const selectedLane = lanes.find((lane) => lane.universe.id === selection?.id);
  const events =
    selectedLane?.universe.events.filter((e) => e.month === selection?.month) ??
    [];
  function activate(id: string | null) {
    setActiveId(id);
    setSelection(null);
  }
  function inspect(id: string, month: number) {
    setActiveId(id);
    setSelection({ id, month });
  }
  function keyboard(event: React.KeyboardEvent, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }
  return (
    <div
      className="timeline-scroll"
      ref={rootRef}
      onMouseLeave={(event) => {
        if (
          !containsTarget(event.relatedTarget) &&
          !containsTarget(document.activeElement)
        )
          activate(null);
      }}
      onBlur={(event) => {
        if (!containsTarget(event.relatedTarget)) activate(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setSelection(null);
        }
      }}
    >
      <div className="timeline-stage">
        <svg
          className={`timeline-canvas ${activeId ? "has-active" : ""}`}
          viewBox={`0 0 1200 ${height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Financial multiverse branching timeline"
        >
          <g
            className="map-axis"
            role="group"
            aria-label="Timeline in three-month intervals"
          >
            <text x={start} y={axisY + 5} className="timeline-axis-title">
              Timeline
            </text>
            <path
              className="timeline-axis-line"
              d={`M${timeStart},${axisY}H${end}`}
            />
            {ticks.map((month) => {
              const date = monthLabel(profile, month);
              const [name, year] = date.split(" ");
              return (
                <g key={month} aria-label={`${date}, month ${month}`}>
                  <line
                    className="timeline-gridline"
                    x1={timeX(month)}
                    x2={timeX(month)}
                    y1="32"
                    y2={axisY - 12}
                  />
                  <path
                    className="timeline-tick"
                    d={`M${timeX(month)},${axisY - 6}v12`}
                  />
                  <text
                    className="canvas-date"
                    x={timeX(month)}
                    y={axisY + 25}
                    textAnchor="middle"
                  >
                    <tspan x={timeX(month)}>
                      {month === 0 ? "Today" : name}
                    </tspan>
                    <tspan x={timeX(month)} dy="17">
                      {year}
                    </tspan>
                  </text>
                </g>
              );
            })}
            {selection && (
              <line
                className="timeline-event-guide"
                x1={timeX(selection.month)}
                x2={timeX(selection.month)}
                y1="32"
                y2={axisY + 8}
              />
            )}
          </g>
          <g
            className="main-reality-node"
            role="button"
            tabIndex={0}
            aria-label="Inspect Main Reality"
            onClick={onReality}
            onFocus={() => activate(null)}
            onMouseEnter={() => activate(null)}
            onKeyDown={(e) => keyboard(e, onReality)}
          >
            <rect
              x={start - 22}
              y={baselineY - 22}
              width={end - start + 44}
              height="44"
              fill="transparent"
            />
            <path
              className="reality-line-path"
              d={`M${start},${baselineY}H${end}`}
            />
            <circle cx={start} cy={baselineY} r="9" fill="#687762" />
            <path
              className="reality-continuation"
              d={`M${end + 14},${baselineY}H1170`}
            />
            <text
              className="branch-label"
              x={start - 8}
              y={baselineY - 28}
              textAnchor="start"
              dominantBaseline="central"
            >
              Main Reality
            </text>
          </g>
          {lanes
            .filter((node) => node.fork <= horizon)
            .map((node) => {
              const u = node.universe,
                laneY = baselineY + node.lane * gap;
              const color = laneColor(node);
              const { fromX, fromY, toX, toY } = geometry.get(u.id)!;
              const dx = toX - fromX;
              const line = `M${fromX},${fromY} C${fromX + dx * 0.45},${fromY} ${fromX + dx * 0.55},${toY} ${toX},${toY} H${end}`;
              const labelX = end + 18;
              const labelLimit = Math.max(10, Math.floor((1170 - labelX) / 9));
              const labelY = toY - 22;
              return (
                <g
                  key={u.id}
                  className={`universe-lane ${u.archived ? "archived" : ""} ${activeId === u.id ? "is-active" : ""}`}
                  style={{ color }}
                >
                  <path
                    className="universe-line-bridge"
                    d={line}
                    aria-hidden="true"
                  />
                  <path
                    className="universe-line"
                    d={line}
                    strokeWidth={7}
                    role="button"
                    tabIndex={0}
                    aria-label={`Explore ${u.name}`}
                    onPointerEnter={() => activate(u.id)}
                    onMouseEnter={() => activate(u.id)}
                    onFocus={() => activate(u.id)}
                    onClick={() => onSelect(u)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onBranch?.(u);
                    }}
                    onKeyDown={(e) => keyboard(e, () => onSelect(u))}
                  />
                  <path
                    className="universe-line-hit"
                    d={line}
                    aria-hidden="true"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onBranch?.(u);
                    }}
                    onPointerEnter={() => activate(u.id)}
                    onMouseEnter={() => activate(u.id)}
                    onClick={() => onSelect(u)}
                  />
                  <path
                    className="branch-junction"
                    d={`M${fromX},${fromY - 6} L${fromX + 6},${fromY} L${fromX},${fromY + 6} L${fromX - 6},${fromY} Z`}
                    aria-hidden="true"
                  />
                  <path
                    className="universe-continuation"
                    d={`M${end + 14},${laneY}H1170`}
                  />
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${u.name}`}
                    className="lane-endpoint"
                    onPointerEnter={() => activate(u.id)}
                    onMouseEnter={() => activate(u.id)}
                    onFocus={() => activate(u.id)}
                    onClick={() => onSelect(u)}
                    onKeyDown={(e) => keyboard(e, () => onSelect(u))}
                  >
                    <rect x={labelX - 8} y={labelY - 17} width={Math.min(340, Math.max(108, u.name.length * 9 + 20))} height="34" rx="10" className="branch-label-backdrop" />
                    <text
                      className="branch-label"
                      x={labelX}
                      y={labelY}
                      textAnchor="start"
                      dominantBaseline="central"
                    >
                      {u.name.length > labelLimit
                        ? `${u.name.slice(0, labelLimit - 1)}...`
                        : u.name}
                    </text>
                  </g>
                  {onBranch && (
                    <g
                      className="branch-context-action"
                      role="button"
                      tabIndex={0}
                      aria-label={`Branch ${u.name}`}
                      onClick={() => onBranch(u)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onBranch(u);
                      }}
                      onKeyDown={(event) => keyboard(event, () => onBranch(u))}
                    />
                  )}
                </g>
              );
            })}
          <g className="timeline-events">
            {lanes
              .filter((lane) => lane.fork <= horizon)
              .flatMap((node) => {
                const u = node.universe;
                const color = laneColor(node);
                const months = [
                  ...new Set(
                    mapEvents(node)
                      .filter((event) => event.month <= horizon)
                      .map((event) => event.month),
                  ),
                ].sort((a, b) => a - b);
                return months.map((month, index) => {
                  const dotX = timeX(month);
                  const left =
                    index > 0
                      ? Math.max(
                          dotX - 28,
                          (dotX + timeX(months[index - 1])) / 2,
                        )
                      : dotX - 28;
                  const right =
                    index < months.length - 1
                      ? Math.min(
                          dotX + 28,
                          (dotX + timeX(months[index + 1])) / 2,
                        )
                      : dotX + 28;
                  const monthEvents = u.events.filter(
                    (event) => event.month === month,
                  );
                  const expanded =
                    selection?.id === u.id && selection.month === month;
                  return (
                    <g
                      key={`${u.id}:${month}`}
                      className="event-marker"
                      role="button"
                      tabIndex={0}
                      style={{ color }}
                      aria-label={`${u.name}: ${monthEvents.map((event) => event.label).join(", ")}`}
                      aria-expanded={expanded}
                      aria-controls={
                        expanded ? "timeline-event-details" : undefined
                      }
                      onPointerEnter={() => inspect(u.id, month)}
                      onMouseEnter={() => inspect(u.id, month)}
                      onFocus={() => inspect(u.id, month)}
                      onClick={() => inspect(u.id, month)}
                      onKeyDown={(event) =>
                        keyboard(event, () => inspect(u.id, month))
                      }
                    >
                      <rect
                        className="event-hit-area"
                        x={left}
                        y={eventY(node, month) - 28}
                        width={right - left}
                        height="56"
                        fill="transparent"
                      />
                      <circle
                        className="marker-dot"
                        cx={timeX(month)}
                        cy={eventY(node, month)}
                        r="7"
                        fill="#fff"
                        stroke={color}
                        strokeWidth="2"
                      />
                    </g>
                  );
                });
              })}
          </g>
        </svg>
        {selectedLane &&
          selection &&
          events.length > 0 &&
          createPortal(
            <div
              id="timeline-event-details"
              ref={popoverRef}
              className="event-popover"
              onMouseLeave={(event) => {
                if (
                  !containsTarget(event.relatedTarget) &&
                  !containsTarget(document.activeElement)
                )
                  activate(null);
              }}
              role="region"
              aria-label="Event details"
              style={{
                position: "fixed",
                left: popoverPosition?.left ?? 0,
                top: popoverPosition?.top ?? 0,
                visibility: popoverPosition ? "visible" : "hidden",
              }}
            >
              <div className="event-popover-heading">
                <strong>{selectedLane.universe.name}</strong>
                <span>{monthLabel(profile, selection.month)}</span>
              </div>
              {events.map((event) => (
                <div className="event-popover-row" key={event.id}>
                  <span>
                    {event.label}
                    {event.estimated && <small>Estimate</small>}
                  </span>
                  <b>
                    {eventAmountLabel(event)}
                  </b>
                </div>
              ))}
              <button
                className="event-open"
                onClick={() => onSelect(selectedLane.universe, selection.month)}
              >
                Explore this month &rarr;
              </button>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
