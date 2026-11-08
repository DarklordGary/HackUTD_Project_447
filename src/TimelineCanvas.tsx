import { useMemo } from "react";
import type { Profile, Universe } from "./types";
import { milestones, monthLabel, money, simulate } from "./engine";

interface Lane {
  universe: Universe;
  lane: number;
  fork: number;
  parent?: Lane;
}
function financialKey(e: Universe["events"][number]) {
  return `${e.kind}:${e.month}:${e.amount}`;
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
    const node = {
      universe,
      lane,
      fork: Math.max(
        1,
        Math.min(
          36,
          differences.length
            ? Math.min(...differences) - 3
            : (parent?.fork ?? 1),
        ),
      ),
      parent,
    };
    nodes.set(universe.id, node);
    ordered.push(node);
    return node;
  }
  universes.forEach((u) => visit(u, new Set()));
  return ordered;
}
export default function TimelineCanvas({
  universes,
  profile,
  horizon,
  onSelect,
  onReality,
}: {
  universes: Universe[];
  profile: Profile;
  horizon: number;
  onSelect: (u: Universe, month?: number) => void;
  onReality: () => void;
}) {
  const lanes = useMemo(() => layoutTimelines(universes), [universes]);
  const lowest = Math.min(-1, ...lanes.map((n) => n.lane)),
    highest = Math.max(1, ...lanes.map((n) => n.lane));
  const gap = 108,
    top = 72,
    baselineY = top - lowest * gap,
    height = Math.max(480, (highest - lowest) * gap + 148);
  const start = 64,
    end = 1120,
    x = (m: number) => start + (m / horizon) * (end - start);
  function yAt(node: Lane | undefined, month: number): number {
    if (!node) return baselineY;
    const from = yAt(node.parent, node.fork),
      target = baselineY + node.lane * gap;
    const t = Math.max(0, Math.min(1, (month - node.fork) / 3));
    return from + (target - from) * t * t * (3 - 2 * t);
  }
  return (
    <div className="timeline-scroll">
      <svg
        className="timeline-canvas"
        viewBox={`0 0 1200 ${height}`}
        style={{ minHeight: height }}
        aria-label="Financial multiverse branching timeline"
      >
        <defs>
          <pattern
            id="canvas-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".6" fill="#d5dbd5" opacity=".55" />
          </pattern>
        </defs>
        <rect width="1200" height={height} fill="url(#canvas-grid)" />
        {[0, horizon / 4, horizon / 2, (horizon * 3) / 4, horizon].map((m) => (
          <g key={m}>
            <line
              x1={x(m)}
              x2={x(m)}
              y1="34"
              y2={height - 40}
              stroke="#edf0ed"
              strokeDasharray="3 6"
            />
            <text
              x={x(m)}
              y={height - 17}
              textAnchor="middle"
              className="canvas-date"
            >
              {m === 0 ? "Today" : monthLabel(profile, Math.round(m))}
            </text>
          </g>
        ))}
        <g
          className="main-reality-node"
          role="button"
          tabIndex={0}
          aria-label="Inspect Main Reality"
          onClick={onReality}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onReality();
            }
          }}
        >
          <text x={start} y={baselineY - 24} className="main-reality-label">
            Main Reality
          </text>
          <text x={start} y={baselineY + 31} className="canvas-caption">
            Your real-world starting point
          </text>
          <path
            d={`M${start},${baselineY}H${end}`}
            stroke="#343e38"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx={start} cy={baselineY} r="7" fill="#343e38" />
          <circle cx={end} cy={baselineY} r="5" fill="#343e38" />
          <path
            d={`M${end + 10},${baselineY}H1170`}
            stroke="#343e38"
            strokeWidth="3"
            strokeDasharray="1 9"
            strokeLinecap="round"
          />
        </g>
        {lanes
          .filter((n) => n.fork <= horizon)
          .map((node) => {
            const u = node.universe,
              forkX = x(node.fork),
              fromY = yAt(node.parent, node.fork),
              laneY = baselineY + node.lane * gap;
            const curveEnd = Math.min(end, x(node.fork + 3));
            const color = u.archived ? "#adb4af" : "#587b67";
            const points = Array.from({ length: 31 }, (_, i) => {
              const m =
                node.fork +
                ((Math.min(horizon, node.fork + 3) - node.fork) * i) / 30;
              return `${i === 0 ? "M" : "L"}${x(m)},${yAt(node, m)}`;
            }).join(" ");
            const rows = simulate(profile, u.events);
            const eligibleMilestones = milestones(rows).filter(
              (m) => m.month > node.fork + 7 && m.month < horizon - 2,
            );
            const milestone =
              eligibleMilestones.find((m) => m.type === "debt") ??
              eligibleMilestones[0];
            const scheduled = u.events
              .filter(
                (e, i, all) =>
                  e.month >= node.fork + 3 &&
                  e.month < horizon - 1 &&
                  all.findIndex((other) => other.month === e.month) === i,
              )
              .slice(0, 3);
            const markers = [
              ...scheduled.map((e) => ({
                key: e.id,
                month: e.month,
                label: e.label,
                amount: money(e.amount),
                milestone: false,
              })),
              ...(milestone &&
              !scheduled.some((e) => Math.abs(e.month - milestone.month) < 5)
                ? [
                    {
                      key: milestone.label,
                      month: milestone.month,
                      label: milestone.label,
                      amount: "Projected milestone",
                      milestone: true,
                    },
                  ]
                : []),
            ];
            return (
              <g
                key={u.id}
                className={`universe-lane ${u.archived ? "archived" : ""}`}
              >
                <path
                  d={`${points}H${end}`}
                  stroke={color}
                  strokeWidth="2.5"
                  fill="none"
                />
                <path
                  d={`${points}H${end}`}
                  className="lane-hit-area"
                  role="button"
                  tabIndex={0}
                  aria-label={`Explore ${u.name}`}
                  onClick={() => onSelect(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(u);
                    }
                  }}
                />
                <circle
                  cx={forkX}
                  cy={fromY}
                  r="5"
                  fill="#fff"
                  stroke={color}
                  strokeWidth="2"
                />
                <g
                  role="button"
                  tabIndex={0}
                  className="lane-name-button"
                  aria-label={`Open ${u.name}`}
                  onClick={() => onSelect(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelect(u);
                  }}
                >
                  <text
                    x={Math.min(curveEnd + 12, end - 200)}
                    y={laneY - 18}
                    className="lane-name"
                  >
                    {u.name}
                  </text>
                  <text
                    x={Math.min(curveEnd + 12, end - 200)}
                    y={laneY + 24}
                    className="canvas-caption"
                  >
                    {u.parentId
                      ? `↳ ${node.parent?.universe.name ?? "Parent timeline"}`
                      : "A possible future"}
                    {u.archived ? " · archived" : ""}
                  </text>
                </g>
                {markers.map((m, index) => (
                  <g
                    key={m.key}
                    role="button"
                    tabIndex={0}
                    className="event-marker"
                    aria-label={`${u.name}: ${m.label}`}
                    onClick={() => onSelect(u, m.month)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(u, m.month);
                      }
                    }}
                  >
                    <title>
                      {m.label} · {monthLabel(profile, m.month)} · {m.amount}
                    </title>
                    <line
                      x1={x(m.month)}
                      x2={x(m.month)}
                      y1={laneY}
                      y2={laneY - 20 - (index % 2) * 15}
                      stroke="#899a8e"
                    />
                    <circle
                      cx={x(m.month)}
                      cy={laneY - 21 - (index % 2) * 15}
                      r="2"
                      fill="#899a8e"
                    />
                    <circle
                      cx={x(m.month)}
                      cy={laneY}
                      r="6"
                      fill={m.milestone ? "#e5efdf" : "#fff"}
                      stroke={color}
                      strokeWidth="2"
                    />
                    <text
                      x={x(m.month)}
                      y={laneY - 31 - (index % 2) * 15}
                      textAnchor="middle"
                      className="event-label"
                    >
                      {m.label.length > 24
                        ? `${m.label.slice(0, 23)}…`
                        : m.label}
                    </text>
                  </g>
                ))}
                <path
                  d={`M${end + 8},${laneY}H1170`}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeDasharray="1 8"
                  strokeLinecap="round"
                />
                <circle
                  cx={end}
                  cy={laneY}
                  r="5"
                  fill="white"
                  stroke={color}
                  strokeWidth="2"
                />
              </g>
            );
          })}
      </svg>
    </div>
  );
}
