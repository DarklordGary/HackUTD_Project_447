import { eventAmountLabel } from "./engine";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Car,
  ChevronDown,
  GraduationCap,
  Home,
  Sparkles,
} from "lucide-react";
import type { FinancialEvent, Profile, Projection, Universe } from "./types";
import { money } from "./engine";
export function Parrot({
  size = 44,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Ping the parrot"
    >
      <path d="M14 51V26C14 9 42 7 47 24l-6 22-12-4-8 14Z" fill="#41845b" />
      <path d="M29 18C42 9 54 20 51 31l-15 4Z" fill="#b8e77b" />
      <path d="m48 25 12 7-13 6Z" fill="#efb65d" />
      <circle cx="43" cy="23" r="3" fill="#143e31" />
      <circle cx="44" cy="22" r=".9" fill="white" />
      <path d="M24 30c15-2 16 15 2 18" fill="#286a48" />
      <path d="m17 48-3 11 10-7" fill="#89ba66" />
    </svg>
  );
}
export const UniverseIcon = ({
  icon,
  size = 20,
}: {
  icon: Universe["icon"];
  size?: number;
}) => {
  const Icon = {
    city: Building2,
    home: Home,
    sparkles: Sparkles,
    car: Car,
    graduation: GraduationCap,
  }[icon];
  return <Icon size={size} />;
};
export function MiniLandscape({
  kind,
  color,
}: {
  kind: Universe["icon"];
  color: string;
}) {
  return (
    <svg viewBox="0 0 280 88" className="landscape" aria-hidden="true">
      <defs>
        <linearGradient id={`land-${kind}`} x2="0" y2="1">
          <stop stopColor={color} stopOpacity=".12" />
          <stop offset="1" stopColor={color} stopOpacity=".02" />
        </linearGradient>
      </defs>
      <rect width="280" height="88" fill={`url(#land-${kind})`} />
      <circle cx="225" cy="26" r="13" fill={color} opacity=".18" />
      <path
        d="M0 78Q45 58 92 76T190 72T280 65V88H0"
        fill={color}
        opacity=".08"
      />
      {kind === "city" ? (
        <g fill={color} opacity=".52">
          <path d="M82 76V39h24v37M111 76V20h23v56M139 76V32h31v44M175 76V46h24v30" />
          <path d="M120 20V8h5v12M146 32V20h4v12" />
          <g stroke="#fff" strokeWidth="3" opacity=".8">
            <path d="M88 47h12m-12 9h12m-12 9h12m17-36h11m-11 10h11m-11 10h11m-11 10h11m17-20h18m-18 10h18m-18 10h18" />
          </g>
        </g>
      ) : kind === "home" ? (
        <g stroke={color} strokeWidth="2" fill={color} fillOpacity=".2">
          <path d="m96 48 42-32 43 32v31H96Z" />
          <path d="m88 49 50-39 51 39M120 79V56h19v23" />
          <path d="M151 49h17v16h-17Z" fill="white" />
          <path d="M83 78V55m-7 9 7-13 7 13" />
        </g>
      ) : (
        <g stroke={color} strokeWidth="2" fill="none">
          <path d="M85 72c24-2 32-11 44-27s28-18 58-28" strokeDasharray="4 5" />
          <path d="m175 16 14-2-7 13" />
          <circle cx="106" cy="58" r="10" fill={color} fillOpacity=".13" />
          <circle cx="149" cy="38" r="13" fill={color} fillOpacity=".18" />
          <path
            d="m209 40 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z"
            fill={color}
            fillOpacity=".4"
          />
        </g>
      )}
      <path d="M65 79h147" stroke={color} opacity=".25" />
    </svg>
  );
}
interface Series {
  id: string;
  name: string;
  color: string;
  rows: Projection[];
  dashed?: boolean;
}
export function AnimatedValue({ value }: { value: number }) {
  return (
    <span key={value} className="value-change">
      {money(value)}
    </span>
  );
}
export function ProjectionChart({
  series,
  metric = "netWorth",
  horizon = 36,
  month,
  onMonth,
  profile,
  events = [],
}: {
  series: Series[];
  metric?: "netWorth" | "savings" | "liquid" | "netCashFlow" | "debt";
  horizon?: number;
  month: number;
  onMonth: (m: number) => void;
  profile: Profile;
  events?: FinancialEvent[];
}) {
  const gradientId = useId().replaceAll(":", "");
  const [hover, setHover] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(840);
  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width > 0)
        setChartWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const compact = chartWidth < 520;
  const width = chartWidth,
    height = 260,
    left = compact ? 54 : 62,
    right = compact ? 14 : 20,
    top = 22,
    bottom = 34;
  const values = series.flatMap((s) =>
    s.rows.slice(0, horizon + 1).map((r) => r[metric]),
  );
  const magnitude = Math.max(100, ...values.map((v) => Math.abs(v)));
  const unit = Math.pow(10, Math.floor(Math.log10(magnitude))) / 2;
  const min = Math.floor(Math.min(0, ...values) / unit) * unit;
  const max = Math.max(unit, Math.ceil(Math.max(...values) / unit) * unit);
  const x = (m: number) => left + (m / horizon) * (width - left - right);
  const y = (v: number) =>
    top + ((max - v) / (max - min)) * (height - top - bottom);
  const path = (rows: Projection[]) =>
    rows
      .slice(0, horizon + 1)
      .map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r[metric])}`)
      .join(" ");
  const active = hover ?? Math.min(month, horizon);
  const row = series[0]?.rows[active];
  return (
    <div className="chart-wrap" ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="projection-chart"
        role="group"
        aria-label={`${metric} projections for ${series.map((s) => s.name).join(", ")}. Use the month slider for exact values.`}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const m = Math.round(
            ((((e.clientX - box.left) / box.width) * width - left) /
              (width - left - right)) *
              horizon,
          );
          setHover(Math.max(0, Math.min(horizon, m)));
        }}
        onMouseLeave={() => setHover(null)}
        onClick={() => onMonth(active)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={series[0]?.color} stopOpacity=".13" />
            <stop offset="1" stopColor={series[0]?.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4).map(
          (tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e7eae3"
                strokeDasharray="3 5"
              />
              <text
                x={left - 14}
                y={y(tick) + 4}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={compact ? 12 : 11}
              >
                {money(tick, true)}
              </text>
            </g>
          ),
        )}
        {series[0] && (
          <path
            d={`${path(series[0].rows)} L${x(horizon)},${y(min)} L${x(0)},${y(min)} Z`}
            fill={`url(#${gradientId})`}
          />
        )}
        {series.map((s) => (
          <path
            key={s.id}
            d={path(s.rows)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.8 : 2.6}
            strokeDasharray={s.dashed ? "5 5" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {events
          .filter(
            (event, index, all) =>
              event.month <= horizon &&
              all.findIndex((e) => e.month === event.month) === index,
          )
          .slice(0, 5)
          .map((event, index) => {
            const pointY = y(series[0]?.rows[event.month][metric] ?? 0);
            const below = pointY < 70;
            const labelY = below
              ? pointY + 38 + (index % 2) * 16
              : pointY - 30 - (index % 2) * 16;
            return (
              <g
                key={event.id}
                className="chart-event"
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${event.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMonth(event.month);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onMonth(event.month);
                  }
                }}
              >
                <title>
                  {event.label} · {eventAmountLabel(event)}
                </title>
                <circle
                  cx={x(event.month)}
                  cy={pointY}
                  r="28"
                  fill="transparent"
                  className="chart-hit-area"
                />
                <line
                  x1={x(event.month)}
                  x2={x(event.month)}
                  y1={pointY}
                  y2={labelY + (below ? -12 : 8)}
                  stroke="#8c9691"
                />
                <circle
                  cx={x(event.month)}
                  cy={pointY}
                  r="5"
                  fill="white"
                  stroke="#315e45"
                  strokeWidth="2"
                />
                <text
                  x={x(event.month)}
                  y={labelY}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#59645e"
                >
                  {event.label.length > 22
                    ? `${event.label.slice(0, 21)}…`
                    : event.label}
                </text>
              </g>
            );
          })}
        <line
          x1={x(active)}
          x2={x(active)}
          y1={top}
          y2={height - bottom}
          stroke="#aab6a6"
          strokeDasharray="3 4"
        />
        {series.map((s) => (
          <circle
            key={s.id}
            cx={x(active)}
            cy={y(s.rows[active][metric])}
            r="4.5"
            fill={s.color}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {(compact
          ? [0, horizon / 2, horizon]
          : [0, horizon / 4, horizon / 2, (horizon * 3) / 4, horizon]
        ).map((m) => (
          <text
            key={m}
            x={x(m)}
            y={height - 8}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize={compact ? 12 : 11}
          >
            {m === 0
              ? "Today"
              : new Date(
                  new Date(`${profile.startDate}T12:00:00`).setMonth(
                    new Date(`${profile.startDate}T12:00:00`).getMonth() +
                      Math.round(m),
                  ),
                ).toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })}
          </text>
        ))}
      </svg>
      {hover !== null && row && (
        <div
          className="chart-tooltip"
          style={{ left: `${Math.min(78, 7 + (active / horizon) * 79)}%` }}
        >
          <span>{row.date}</span>
          {series.map((s) => (
            <div key={s.id}>
              <i style={{ background: s.color }} />
              {s.name}
              <b>{money(s.rows[active][metric])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Breakdown({ row }: { row: Projection }) {
  return (
    <div className="breakdown">
      <div className="breakdown-heading">
        <div>
          <span className="eyebrow">A MOMENT IN THIS UNIVERSE</span>
          <h3>{row.date}</h3>
        </div>
        <span className={`status ${row.netCashFlow < 0 ? "warning" : ""}`}>
          {row.netCashFlow < 0 ? (
            <ArrowDownLeft size={13} />
          ) : (
            <ArrowUpRight size={13} />
          )}
          <AnimatedValue value={row.netCashFlow} /> cash flow
        </span>
      </div>
      <div className="breakdown-grid">
        {[
          ["Income", row.income],
          ["Living expenses", row.expenses],
          ["Savings", row.savings],
          ["Outstanding debt", row.debt],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>
              <AnimatedValue value={Number(value)} />
            </b>
          </div>
        ))}
      </div>
      <details className="monthly-details">
        <summary>
          Full monthly breakdown <ChevronDown size={16} />
        </summary>
        <div className="breakdown-grid">
          {[
            ["Debt payments", row.debtPayments],
            ["Invested this month", row.investmentContribution],
            ["Investment growth", row.investmentGrowth],
            ["Checking", row.checking],
            ["Investments", row.investments],
            ["Net worth", row.netWorth],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>
                <AnimatedValue value={Number(value)} />
              </b>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
