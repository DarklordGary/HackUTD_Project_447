import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  GitBranch,
  HelpCircle,
  Layers,
  ListTree,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Map,
  List,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react";
import { usePing } from "./usePing";
import type { PingController } from "./usePing";
import type { Mode, Universe } from "./types";
import { assess, milestones, money, monthLabel, simulate } from "./engine";
import { seed } from "./seed";
import { upgradeWorkspace } from "./workspace-upgrade";
import {
  AnimatedValue,
  Breakdown,
  Parrot,
  ProjectionChart,
  UniverseIcon,
} from "./components";
import TimelineCanvas, { selectMapUniverses } from "./TimelineCanvas";

type Metric = "savings" | "netWorth" | "netCashFlow" | "debt";
export default function App() {
  const ping = usePing();
  const { state, profile, universe, baseline, page, selectedRows } = ping;
  const [metric, setMetric] = useState<Metric>("savings");
  const [showArchived, setShowArchived] = useState(false);
  const [baselineChart, setBaselineChart] = useState(false);
  const [timelineView, setTimelineView] = useState<"map" | "list">(() =>
    window.matchMedia?.("(max-width: 700px)").matches ? "list" : "map",
  );
  const [selectedBranches, setSelectedBranches] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("ping.map.visible.v1") || "null",
      );
      if (Array.isArray(saved) && saved.every((id) => typeof id === "string"))
        return saved;
    } catch {
      /* Use the default visible branch family. */
    }
    return selectMapUniverses(state.universes.filter((u) => !u.archived)).map(
      (u) => u.id,
    );
  });
  const knownBranches = useRef(new Set(state.universes.map((u) => u.id)));
  useEffect(() => {
    const added = state.universes
      .filter((u) => !u.archived && !knownBranches.current.has(u.id))
      .map((u) => u.id);
    const existing = new Set(state.universes.map((u) => u.id));
    knownBranches.current = existing;
    if (added.length)
      setSelectedBranches((ids) => [
        ...new Set([...ids.filter((id) => existing.has(id)), ...added]),
      ]);
  }, [state.universes]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "ping.map.visible.v1",
        JSON.stringify(selectedBranches),
      );
    } catch {
      /* Keep selections for this session. */
    }
  }, [selectedBranches]);
  const mainRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const route = `${page}:${universe?.id ?? "root"}`;
  const previousRoute = useRef(route);
  useEffect(() => {
    if (previousRoute.current !== route && !ping.chat)
      mainRef.current?.focus({ preventScroll: true });
    previousRoute.current = route;
  }, [route, ping.chat]);
  useEffect(() => {
    if (!ping.help && !ping.confirmReset) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = modalRef.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, [tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ping.help, ping.confirmReset]);
  const active = state.universes.filter((u) => !u.archived);
  const visible = showArchived ? state.universes : active;
  const mapped = visible.filter((universe) =>
    selectedBranches.includes(universe.id),
  );
  function selectUniverse(u: Universe, month = 12) {
    ping.openUniverse(u);
    ping.setMonth(month);
    ping.setMode("branch");
    ping.setThread(u.messages);
    ping.setChat(false);
  }
  function showTimelines() {
    ping.navigate("timelines");
    ping.setChat(false);
    ping.setMode("create");
    ping.setThread([]);
  }
  function showBaseline() {
    ping.navigate("baseline");
    ping.setChat(false);
    ping.setMode("create");
    ping.setThread([]);
  }
  function archiveUniverse() {
    if (!universe) return;
    ping.setState((prev) => ({
      ...prev,
      universes: prev.universes.map((u) =>
        u.id === universe.id ? { ...u, archived: !u.archived } : u,
      ),
    }));
    ping.setToast(
      universe.archived
        ? "Timeline restored"
        : "Timeline archived. Its history is preserved.",
    );
    showTimelines();
  }
  const currentSeries = [
    {
      id: universe?.id ?? "current",
      name: universe?.name ?? "Main Reality",
      color: "#48745b",
      rows: universe ? selectedRows : baseline,
    },
    ...(universe
      ? [
          {
            id: "current",
            name: "Main Reality",
            color: "#adb5af",
            rows: baseline,
            dashed: true,
          },
        ]
      : []),
  ];
  const title =
    page === "baseline"
      ? "My Baseline"
      : page === "settings"
        ? "Settings"
        : page === "updates"
          ? "Reality updates"
          : page === "compare"
            ? "Compare paths"
            : "Timelines";
  return (
    <div className="app-shell reference-layout">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={showTimelines}
          aria-label="Ping home"
        >
          <span className="brand-mark">
            <img src="/ping.svg" alt="" />
          </span>
          <span>Ping</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${page === "timelines" || page === "compare" ? "active" : ""}`}
            onClick={showTimelines}
            aria-label="Timelines"
            aria-current={page === "timelines" ? "page" : undefined}
          >
            <ListTree size={19} />
            <span>Timelines</span>
            <small>{active.length}</small>
          </button>
          <button
            className={`nav-item ${page === "baseline" ? "active" : ""}`}
            onClick={showBaseline}
            aria-label="My Baseline"
            aria-current={page === "baseline" ? "page" : undefined}
          >
            <TrendingUp size={19} />
            <span>My Baseline</span>
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            aria-label="Settings"
            aria-current={page === "settings" ? "page" : undefined}
            onClick={() => {
              ping.navigate("settings");
              ping.setChat(false);
            }}
          >
            <Settings2 size={19} />
            <span>Settings</span>
          </button>
          <button
            className={`nav-item ${page === "updates" ? "active" : ""}`}
            aria-label="Updates"
            aria-current={page === "updates" ? "page" : undefined}
            onClick={() => {
              ping.navigate("updates");
              ping.setChat(false);
            }}
          >
            <Bell size={19} />
            <span>Updates</span>
            {ping.unread > 0 && <small>{ping.unread}</small>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-health">
            <i />
            <div>{ping.storage}</div>
          </div>
          <div className="profile">
            <div className="avatar">AM</div>
            <div>
              {profile.name}
              <small>{profile.location}</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <main
          key={route}
          ref={mainRef}
          tabIndex={-1}
          aria-label={title}
          className={`workspace-content ${page === "timelines" && !universe ? "canvas-workspace" : ""}`}
        >
          {page === "timelines" && !universe && (
            <section className="canvas-panel">
              <div className="graph-toolbar">
                <h1 className="sr-only">Your financial multiverse</h1>
                <div className="toolbar-actions">
                  <button
                    className="secondary-button compare-action"
                    onClick={() => ping.setPage("compare")}
                  >
                    <Layers size={15} /> Compare paths
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => ping.openChat()}
                  >
                    <Plus size={16} /> New universe
                  </button>
                </div>
              </div>
              <div className="canvas-topline">
                <div
                  className="view-switch"
                  role="group"
                  aria-label="Timeline view"
                >
                  <button
                    aria-pressed={timelineView === "map"}
                    onClick={() => setTimelineView("map")}
                  >
                    <Map size={16} /> Map
                  </button>
                  <button
                    aria-pressed={timelineView === "list"}
                    onClick={() => setTimelineView("list")}
                  >
                    <List size={16} /> List
                  </button>
                </div>
                <span className="timeline-count">
                  {timelineView === "map"
                    ? `${mapped.length} branches`
                    : `${active.length} possibilities`}
                </span>
                {timelineView === "map" && (
                  <BranchPicker
                    universes={visible}
                    selected={selectedBranches}
                    onChange={setSelectedBranches}
                  />
                )}
                <Horizon value={ping.horizon} onChange={ping.setHorizon} />
              </div>
              {timelineView === "map" && (
                <TimelineCanvas
                  universes={mapped}
                  colorUniverses={state.universes}
                  profile={profile}
                  horizon={ping.horizon}
                  onSelect={selectUniverse}
                  onReality={showBaseline}
                  onBranch={(universe) => ping.openChat("branch", universe)}
                />
              )}
              <div className="canvas-footer">
                <div
                  className="canvas-legend"
                  role="group"
                  aria-label="Chart legend"
                >
                  <span>
                    <i className="reality-line" /> Main Reality
                  </span>
                  <span>
                    <span className="universe-swatches" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>{" "}
                    Possible futures
                  </span>
                  <span>
                    <i className="event-circle" /> Life event
                  </span>
                </div>
                {state.universes.some((u) => u.archived) && (
                  <label className="archive-toggle">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />{" "}
                    Show archived
                  </label>
                )}
              </div>
              {timelineView === "list" && (
                <div className="timeline-directory" aria-label="Your timelines">
                  {(showArchived ? state.universes : active).map((u) => (
                    <div className="directory-item" key={u.id}>
                      <button onClick={() => selectUniverse(u)}>
                        <UniverseIcon icon={u.icon} size={16} />
                        <span>{u.name}</span>
                        <small>{u.description}</small>
                        <span
                          className={`status ${!assess(profile, u).viable ? "warning" : ""}`}
                        >
                          {u.archived ? "Archived" : assess(profile, u).status}
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Branch ${u.name}`}
                        onClick={() => ping.openChat("branch", u)}
                      >
                        <GitBranch size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!active.length && (
                <div className="empty-state">
                  <GitBranch size={28} />
                  <h2>A new possibility starts here.</h2>
                  <p>Ask Ping a “what if” to create your first path.</p>
                  <button
                    className="primary-button"
                    onClick={() => ping.openChat()}
                  >
                    Explore a possibility <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
          )}
          {page === "timelines" && universe && (
            <>
              <div className="detail-page-heading">
                <div>
                  <button className="back-button" onClick={showTimelines}>
                    <ArrowLeft size={14} /> All timelines
                  </button>
                  <h1>{universe.name}</h1>
                  <p>{universe.description}</p>
                </div>
                <span
                  className={`status ${!assess(profile, universe).viable ? "warning" : ""}`}
                >
                  {universe.archived
                    ? "Archived"
                    : assess(profile, universe).status}
                </span>
              </div>
              <div className="branch-workspace">
                <section className="chart-panel">
                  <div className="chart-toolbar">
                    <MetricControls metric={metric} onChange={setMetric} />
                    <button
                      className="icon-button"
                      aria-label="Export monthly projections"
                      onClick={ping.download}
                    >
                      <ArrowDownToLine size={17} />
                    </button>
                  </div>
                  <div className="chart-kicker">
                    <span>
                      {
                        {
                          savings: "Projected savings",
                          netWorth: "Projected net worth",
                          netCashFlow: "Monthly cash flow",
                          debt: "Outstanding debt",
                        }[metric]
                      }
                    </span>
                    <b>
                      {money(selectedRows[ping.month][metric])}
                      <small>{selectedRows[ping.month].date}</small>
                    </b>
                  </div>
                  <ProjectionChart
                    series={currentSeries}
                    metric={metric}
                    month={ping.month}
                    onMonth={ping.setMonth}
                    profile={profile}
                    events={universe.events}
                  />
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: "#48745b" }} />
                      {universe.name}
                    </span>
                    <span>
                      <i className="dashed" />
                      Main Reality
                    </span>
                  </div>
                  <MonthSlider ping={ping} />
                  <Breakdown row={selectedRows[ping.month]} />
                </section>
                <aside className="branch-summary">
                  <div className="summary-heading">
                    <GitBranch size={17} />
                    <h2>Branch Summary</h2>
                  </div>
                  <p className="summary-description">
                    {universe.parentId
                      ? `Branched from ${state.universes.find((u) => u.id === universe.parentId)?.name ?? "another timeline"}`
                      : "A possibility from your Main Reality"}
                  </p>
                  <div className="summary-numbers">
                    <SummaryRow
                      label="Net worth in 3 years"
                      amount={selectedRows[36].netWorth}
                    />
                    <SummaryRow
                      label="Savings in 3 years"
                      amount={selectedRows[36].savings}
                    />
                  </div>
                  <details className="summary-section events-disclosure">
                    <summary>
                      <span>
                        {universe.events.length} scheduled{" "}
                        {universe.events.length === 1 ? "event" : "events"}
                      </span>
                      <ChevronDown size={16} />
                    </summary>
                    <div className="event-list">
                      {universe.events
                        .slice()
                        .sort((a, b) => a.month - b.month)
                        .map((e) => (
                          <div className="event-item" key={e.id}>
                            <span className="event-dot" />
                            <button
                              className="event-copy"
                              onClick={() => ping.setMonth(e.month)}
                            >
                              <small>{monthLabel(profile, e.month)}</small>
                              <b>{e.label}</b>
                              <span>
                                {money(e.amount)}
                                {e.kind === "salary"
                                  ? "/year"
                                  : [
                                        "rent",
                                        "monthly-expense",
                                        "debt-payment",
                                        "contribution",
                                      ].includes(e.kind)
                                    ? "/mo"
                                    : ""}{" "}
                                · {e.estimated ? "Estimate" : "Scenario input"}
                              </span>
                            </button>
                            <button
                              className="icon-button remove-event"
                              aria-label={`Remove ${e.label}`}
                              onClick={() =>
                                ping.setState((prev) => ({
                                  ...prev,
                                  universes: prev.universes.map((u) =>
                                    u.id === universe.id
                                      ? {
                                          ...u,
                                          events: u.events.filter(
                                            (event) => event.id !== e.id,
                                          ),
                                        }
                                      : u,
                                  ),
                                }))
                              }
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </details>
                  {milestones(selectedRows).length > 0 && (
                    <details className="assumptions milestone-summary">
                      <summary>
                        Projected milestones <ChevronDown size={14} />
                      </summary>
                      <div className="event-list">
                        {milestones(selectedRows).map((m) => (
                          <div className="event-item" key={m.label}>
                            <span className="event-dot" />
                            <button
                              className="event-copy"
                              onClick={() => ping.setMonth(m.month)}
                            >
                              <small>{monthLabel(profile, m.month)}</small>
                              <b>
                                <Check size={11} /> {m.label}
                              </b>
                              <span>Calculated from this timeline</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <details className="assumptions">
                    <summary>
                      Assumptions <ChevronDown size={14} />
                    </summary>
                    <ul>
                      {universe.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                      <li>
                        {profile.taxRate * 100}% effective tax;{" "}
                        {(profile.investmentReturn * 100).toFixed(0)}%
                        investment return and{" "}
                        {(profile.savingsRate * 100).toFixed(1)}% savings APR
                        are estimates.
                      </li>
                    </ul>
                  </details>
                  {state.changes.length > 0 &&
                    universe.events.some(
                      (e) => e.kind === "salary" || e.kind === "rent",
                    ) && (
                      <p className="conflict-note">
                        Reality has changed. Hypothetical salary and rent events
                        were kept. Review them here or ask Ping to change them.
                      </p>
                    )}
                  <div className="summary-actions">
                    <button
                      className="primary-button"
                      onClick={() => ping.openChat("branch", universe)}
                    >
                      <GitBranch size={15} /> Branch this timeline
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => ping.openChat("modify", universe)}
                    >
                      <SlidersHorizontal size={15} /> Modify assumptions
                    </button>
                    <details className="timeline-tools">
                      <summary>
                        More actions <ChevronDown size={15} />
                      </summary>
                      <div>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            ping.setCompareIds([
                              universe.parentId ??
                                state.universes.find(
                                  (u) => u.id !== universe.id,
                                )?.id ??
                                universe.id,
                              universe.id,
                            ]);
                            ping.setPage("compare");
                            ping.setChat(false);
                          }}
                        >
                          <Layers size={15} /> Compare with original
                        </button>
                        <button
                          className="text-button"
                          onClick={() => ping.openChat("reality")}
                        >
                          <RefreshCw size={13} /> Update reality
                        </button>
                        <button
                          className="text-button archive-button"
                          onClick={archiveUniverse}
                        >
                          <Archive size={13} />
                          {universe.archived
                            ? "Restore timeline"
                            : "Archive timeline"}
                        </button>
                      </div>
                    </details>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "baseline" && (
            <>
              <div className="baseline-overview">
                <span>
                  Current net worth <b>{money(baseline[0].netWorth)}</b>
                </span>
                <span>
                  Monthly cash flow{" "}
                  <b className="positive">+{money(baseline[1].netCashFlow)}</b>
                </span>
              </div>
              <div className="baseline-grid">
                <FinancialColumn
                  title="Income"
                  subtitle="What comes in"
                  totalLabel="Monthly take-home"
                  total={baseline[1].income}
                  rows={[
                    [
                      "Primary job",
                      `${money((profile.annualSalary * (1 - profile.taxRate)) / 12)}/mo`,
                    ],
                    [
                      "Gross annual salary",
                      `${money(profile.annualSalary)}/yr`,
                    ],
                    ["Effective tax rate", `${profile.taxRate * 100}% est.`],
                  ]}
                />
                <FinancialColumn
                  title="Liquid Assets"
                  subtitle="Ready when life happens"
                  totalLabel="Total available"
                  total={profile.checking + profile.savings}
                  rows={[
                    ["Checking account", money(profile.checking)],
                    ["Savings account", money(profile.savings)],
                    [
                      "Savings interest",
                      `${(profile.savingsRate * 100).toFixed(1)}% APR est.`,
                    ],
                  ]}
                />
                <FinancialColumn
                  title="Recurring Expenses"
                  subtitle="Your regular commitments"
                  totalLabel="Monthly living expenses"
                  total={
                    profile.rent +
                    profile.recurring +
                    profile.variable +
                    profile.obligations
                  }
                  rows={[
                    ["Rent", `${money(profile.rent)}/mo`],
                    ["Bills & subscriptions", `${money(profile.recurring)}/mo`],
                    ["Variable spending", `${money(profile.variable)}/mo`],
                    ["Other obligations", `${money(profile.obligations)}/mo`],
                  ]}
                />
              </div>
              <details className="baseline-more">
                <summary>
                  Debt & investments <ChevronDown size={17} />
                </summary>
                <div className="baseline-secondary">
                  <FinancialColumn
                    title="Outstanding Debt"
                    subtitle="The other side of the balance"
                    totalLabel="Total debt"
                    total={baseline[0].debt}
                    rows={profile.debts.map((d) => [
                      d.name,
                      money(d.balance),
                      `${(d.apr * 100).toFixed(1)}% APR · ${money(d.payment)}/mo`,
                    ])}
                  />
                  <FinancialColumn
                    title="Investments"
                    subtitle="Working toward your future"
                    totalLabel="Invested today"
                    total={profile.investments}
                    rows={[
                      ["Investment portfolio", money(profile.investments)],
                      [
                        "Monthly contribution",
                        `${money(profile.contribution)}/mo`,
                      ],
                      [
                        "Annual return assumption",
                        `${(profile.investmentReturn * 100).toFixed(0)}% est.`,
                      ],
                    ]}
                  />
                </div>
              </details>
              <div className="baseline-actions">
                <span>
                  <Check size={14} /> Predefined demo profile · no account
                  linking needed
                </span>
                <button
                  className="secondary-button"
                  onClick={() => setBaselineChart((v) => !v)}
                >
                  <TrendingUp size={15} />
                  {baselineChart
                    ? "Hide projections"
                    : "View baseline projections"}
                </button>
                <button
                  className="primary-button"
                  onClick={() => ping.openChat("reality")}
                >
                  <RefreshCw size={14} /> Update reality
                </button>
              </div>
              {baselineChart && (
                <section className="chart-panel baseline-chart">
                  <div className="chart-toolbar">
                    <h2>How Main Reality unfolds</h2>
                    <MetricControls metric={metric} onChange={setMetric} />
                  </div>
                  <ProjectionChart
                    series={[
                      {
                        id: "current",
                        name: "Main Reality",
                        color: "#48745b",
                        rows: baseline,
                      },
                    ]}
                    metric={metric}
                    month={ping.month}
                    onMonth={ping.setMonth}
                    profile={profile}
                  />
                  <MonthSlider ping={ping} />
                  <Breakdown row={baseline[ping.month]} />
                </section>
              )}
            </>
          )}
          {page === "compare" && (
            <>
              <div className="page-heading">
                <button className="back-button" onClick={showTimelines}>
                  <ArrowLeft size={14} /> All timelines
                </button>
                <MetricControls metric={metric} onChange={setMetric} />
              </div>
              <div className="compare-picker">
                {state.universes.map((u) => (
                  <button
                    key={u.id}
                    className={ping.compareIds.includes(u.id) ? "selected" : ""}
                    aria-pressed={ping.compareIds.includes(u.id)}
                    onClick={() =>
                      ping.setCompareIds((ids) =>
                        ids.includes(u.id)
                          ? ids.filter((v) => v !== u.id)
                          : [...ids, u.id],
                      )
                    }
                  >
                    <span className="check-box">
                      {ping.compareIds.includes(u.id) && <Check size={11} />}
                    </span>
                    {u.name}
                  </button>
                ))}
              </div>
              <section className="chart-panel">
                <ProjectionChart
                  series={[
                    ...state.universes
                      .filter((u) => ping.compareIds.includes(u.id))
                      .map((u) => ({
                        id: u.id,
                        name: u.name,
                        color: u.color,
                        rows: ping.allRows.get(u.id)!,
                      })),
                    {
                      id: "current",
                      name: "Main Reality",
                      color: "#a6afa8",
                      rows: baseline,
                      dashed: true,
                    },
                  ]}
                  metric={metric}
                  month={ping.month}
                  onMonth={ping.setMonth}
                  profile={profile}
                />
                <MonthSlider ping={ping} />
                <div className="comparison-table-wrap">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>{baseline[ping.month].date}</th>
                        {state.universes
                          .filter((u) => ping.compareIds.includes(u.id))
                          .map((u) => (
                            <th key={u.id}>
                              <i style={{ background: u.color }} />
                              {u.name}
                            </th>
                          ))}
                        <th>Main Reality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Net worth", "netWorth"],
                          ["Savings", "savings"],
                          ["Monthly cash flow", "netCashFlow"],
                          ["Outstanding debt", "debt"],
                          ["Monthly income", "income"],
                        ] as const
                      ).map(([label, key]) => (
                        <tr key={key}>
                          <td>{label}</td>
                          {state.universes
                            .filter((u) => ping.compareIds.includes(u.id))
                            .map((u) => (
                              <td key={u.id}>
                                {money(
                                  ping.allRows.get(u.id)![ping.month][key],
                                )}
                              </td>
                            ))}
                          <td>{money(baseline[ping.month][key])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="relationship-strip">
                <span className="eyebrow">HOW YOUR POSSIBILITIES CONNECT</span>
                <div>
                  <span>Main Reality</span>
                  <ArrowRight size={16} />
                  {state.universes
                    .filter((u) => ping.compareIds.includes(u.id))
                    .map((u) => (
                      <button key={u.id} onClick={() => selectUniverse(u)}>
                        <GitBranch size={14} />
                        <span>
                          {u.name}
                          {u.parentId && (
                            <small>
                              From{" "}
                              {
                                state.universes.find((p) => p.id === u.parentId)
                                  ?.name
                              }
                            </small>
                          )}
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            </>
          )}
          {page === "updates" && (
            <Updates ping={ping} onSelect={selectUniverse} />
          )}
          {page === "settings" && (
            <>
              <section className="settings-panel">
                <h2>Profile & connections</h2>
                <SettingRow
                  title="Financial profile"
                  description={`${profile.name} · ${profile.location}`}
                  value="Seeded demo"
                />
                <SettingRow
                  title="Scenario reasoning"
                  description="Live Nemotron uses financial tools when a server API key is configured."
                  value={ping.ai}
                />
                <SettingRow
                  title="Workspace persistence"
                  description="Your timelines are saved as you explore."
                  value={ping.storage}
                />
              </section>
              <section className="settings-panel">
                <h2>Projection assumptions</h2>
                <SettingRow
                  title="Effective income tax"
                  description="Applied to annual gross salary."
                  value={`${profile.taxRate * 100}%`}
                />
                <SettingRow
                  title="Investment growth"
                  description="Assumed effective annual return; not a guaranteed result."
                  value={`${profile.investmentReturn * 100}% / year`}
                />
                <SettingRow
                  title="Savings interest"
                  description="Applied monthly as APR / 12."
                  value={`${(profile.savingsRate * 100).toFixed(1)}% APR`}
                />
                <SettingRow
                  title="Viability rule"
                  description="Three months of living expenses held as liquid funds; nonnegative cash flow in the final six months."
                  value={money(assess(profile, state.universes[0]).reserve)}
                />
              </section>
              <section className="settings-panel">
                <h2>Demo workspace</h2>
                <div className="settings-reset">
                  <div>
                    <h3>Return to the starting point</h3>
                    <p>
                      Restore Alex’s profile and the three original timelines.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => ping.setConfirmReset(true)}
                  >
                    <RefreshCw size={14} /> Reset demo
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
        <FloatingComposer ping={ping} />
      </div>
      {(ping.help || ping.confirmReset) && (
        <div
          className="modal-overlay"
          onClick={() => {
            ping.setHelp(false);
            ping.setConfirmReset(false);
          }}
        >
          <section
            ref={modalRef}
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close dialog"
              onClick={() => {
                ping.setHelp(false);
                ping.setConfirmReset(false);
              }}
            >
              <X size={18} />
            </button>
            <Parrot size={56} />
            <h2 id="modal-title">
              {ping.confirmReset
                ? "Return to your starting point?"
                : "One reality. Many possible futures."}
            </h2>
            {ping.confirmReset ? (
              <>
                <p>
                  This replaces your saved demo changes with Alex’s original
                  financial profile and three seeded timelines.
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    onClick={() => ping.setConfirmReset(false)}
                  >
                    Keep exploring
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      const next = upgradeWorkspace(seed());
                      ping.setState(next);
                      ping.setCompareIds(
                        next.universes.slice(0, 2).map((u) => u.id),
                      );
                      ping.setConfirmReset(false);
                      showTimelines();
                      ping.setToast("Demo reset");
                    }}
                  >
                    Reset demo
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Main Reality is your actual financial starting point. Every
                  branch is an independent what-if, with its own events and
                  assumptions.
                </p>
                <ol>
                  <li>
                    Select a path or life event to inspect its monthly
                    projection.
                  </li>
                  <li>Ask Ping to create, modify, or branch a timeline.</li>
                  <li>Compare different paths at any month.</li>
                  <li>
                    Update reality when something actually changes. Every path
                    recalculates.
                  </li>
                </ol>
                <p className="help-assumptions">
                  Projections use a deterministic calculation engine. All
                  investment returns, taxes and living-cost estimates are
                  assumptions, not guarantees.
                </p>
                <button
                  className="primary-button"
                  onClick={() => ping.setHelp(false)}
                >
                  Back to the possibilities <ArrowRight size={14} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {ping.toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {ping.toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => ping.setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function BranchPicker({
  universes,
  selected,
  onChange,
}: {
  universes: Universe[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        ref.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="branch-picker" ref={ref}>
      <summary>
        <ListTree size={16} /> Branches (
        {universes.filter((u) => selected.includes(u.id)).length}){" "}
        <ChevronDown size={15} />
      </summary>
      <div
        className="branch-options"
        role="group"
        aria-label="Visible branches"
      >
        <div className="branch-picker-actions">
          <button onClick={() => onChange(universes.map((u) => u.id))}>
            Show all
          </button>
          <button onClick={() => onChange([])}>Hide all</button>
        </div>
        {universes.map((universe) => (
          <label key={universe.id}>
            <input
              type="checkbox"
              aria-label={universe.name}
              checked={selected.includes(universe.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, universe.id]
                    : selected.filter((id) => id !== universe.id),
                )
              }
            />
            <span>
              {universe.name}
              {universe.parentId && (
                <small>
                  From{" "}
                  {universes.find((parent) => parent.id === universe.parentId)
                    ?.name ?? "another timeline"}
                </small>
              )}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

function FloatingComposer({ ping }: { ping: PingController }) {
  const { chat, universe, mode } = ping;
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (chat) inputRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) toggleRef.current?.focus({ preventScroll: true });
    wasOpen.current = chat;
  }, [chat]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ping.setChat((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [ping.setChat]);
  const suggestions =
    mode === "reality"
      ? ["I got a new job paying $90,000.", "I received a $5,000 bonus."]
      : universe && mode !== "create"
        ? [
            "What if I got a $90,000 job two months after moving?",
            "What if rent was $2,400?",
          ]
        : ["Can I move to New York?", "What if I got a job paying $90,000?"];
  return (
    <section
      className={`floating-composer ${chat ? "expanded" : ""} ${ping.busy ? "is-thinking" : ""}`}
      role={chat ? "dialog" : "region"}
      aria-modal={chat ? false : undefined}
      aria-label={chat ? "A chat with Ping" : "Ask Ping"}
    >
      <div className="composer-header">
        <span className="composer-identity">
          <Parrot size={32} />
          <label htmlFor="ping-input">Ask Ping</label>
          <span className="ai-status" title={ping.ai}>
            <i />
            {ping.ai.includes("Demo") ? "Demo" : "Live"}
          </span>
        </span>
        <button
          ref={toggleRef}
          className="icon-button composer-toggle"
          onClick={() => ping.setChat(!chat)}
          aria-label={chat ? "Close chat" : "Expand chat"}
          aria-expanded={chat}
          aria-controls="ping-conversation"
          title={chat ? "Close chat (Esc)" : "Open Ping (Ctrl+K)"}
        >
          {chat ? (
            <Minimize2 size={18} />
          ) : (
            <>
              <kbd>Ctrl K</kbd>
              <Maximize2 size={16} />
            </>
          )}
        </button>
      </div>
      {chat && (
        <div className="composer-conversation" id="ping-conversation">
          <div className="chat-mode">
            <label htmlFor="chat-mode">Exploring</label>
            <select
              id="chat-mode"
              aria-label="You’re exploring"
              value={mode}
              disabled={ping.busy}
              onChange={(event) => ping.setMode(event.target.value as Mode)}
            >
              <option value="create">A new universe</option>
              {universe && (
                <>
                  <option value="branch">A branch of this timeline</option>
                  <option value="modify">A change to this timeline</option>
                </>
              )}
              <option value="reality">An update to my reality</option>
            </select>
          </div>
          {universe && mode !== "create" && mode !== "reality" && (
            <div className="chat-context">
              <GitBranch size={15} />
              <span>{universe.name}</span>
              <small>
                {mode === "branch" ? "Original preserved" : "Editing this path"}
              </small>
            </div>
          )}
          <div
            className="chat-messages"
            role="log"
            aria-label="Conversation with Ping"
            aria-relevant="additions"
            aria-live="polite"
          >
            {!ping.thread.length && (
              <div className="welcome-message">
                <h3>
                  {mode === "reality"
                    ? "What’s new in your life?"
                    : "A little what-if. A new possibility."}
                </h3>
                <p>
                  {mode === "reality"
                    ? "Your update will reach every timeline."
                    : "Tell me what you’re imagining, or start here."}
                </p>
                <div className="chat-suggestions">
                  {suggestions.map((text) => (
                    <button
                      key={text}
                      onClick={() => {
                        ping.setInput(text);
                        inputRef.current?.focus();
                      }}
                    >
                      {text}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ping.thread.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                {message.role === "assistant" && <Parrot size={28} />}
                <div>{message.text}</div>
              </div>
            ))}
            {ping.busy && (
              <div className="chat-thinking" role="status">
                <span className="thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Thinking through this possibility…</span>
              </div>
            )}
            {!!ping.toolSteps.length && !ping.busy && (
              <details className="tool-activity">
                <summary>
                  Ping used {ping.toolSteps.length} tools{" "}
                  <ChevronDown size={15} />
                </summary>
                <ol>
                  {ping.toolSteps.map((step, index) => (
                    <li key={index}>
                      <span>{step.tool.replaceAll("_", " ")}</span>
                      <b>
                        {step.status === "ok"
                          ? "Completed"
                          : "Corrected / rejected"}
                      </b>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {ping.thread.length > 0 && !ping.busy && !ping.requestError && (
              <div className="chat-result-actions">
                {mode === "reality" ? (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      ping.setChat(false);
                      ping.navigate("updates");
                    }}
                  >
                    See what changed <ArrowRight size={16} />
                  </button>
                ) : (
                  universe && (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          ping.setChat(false);
                          ping.openUniverse(universe);
                        }}
                      >
                        Explore this universe <ArrowRight size={16} />
                      </button>
                      {universe.parentId && (
                        <button
                          className="text-button"
                          onClick={() => {
                            ping.setChat(false);
                            ping.setPage("compare");
                          }}
                        >
                          Compare with original <GitBranch size={16} />
                        </button>
                      )}
                    </>
                  )
                )}
              </div>
            )}
            <div ref={ping.bottomRef} />
          </div>
        </div>
      )}
      {ping.requestError && (
        <div className="composer-error" role="alert" id="ping-error">
          <span>{ping.requestError}</span>
          <small>Your message is kept below. Edit it or send again.</small>
        </div>
      )}
      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          ping.setChat(true);
          void ping.send();
        }}
      >
        <input
          ref={inputRef}
          id="ping-input"
          aria-label="Your message to Ping"
          aria-describedby={ping.requestError ? "ping-error" : undefined}
          value={ping.input}
          onChange={(event) => ping.setInput(event.target.value)}
          placeholder={
            mode === "reality"
              ? "Tell me what changed…"
              : universe && mode !== "create"
                ? "What would you change about this path?"
                : "What if I moved to New York?"
          }
          disabled={ping.busy}
        />
        <button
          className="send-button"
          aria-label="Send message"
          disabled={ping.busy || !ping.input.trim()}
        >
          {ping.busy ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <ArrowRight size={19} />
          )}
        </button>
      </form>
      {mode === "reality" && (
        <div className="composer-caption">
          <RefreshCw size={13} /> Updating your real baseline
        </div>
      )}
    </section>
  );
}
function Horizon({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="segmented" aria-label="Timeline horizon">
      {[12, 24, 36].map((n) => (
        <button
          key={n}
          aria-pressed={value === n}
          className={value === n ? "chosen" : ""}
          onClick={() => onChange(n)}
        >
          {n / 12}Y
        </button>
      ))}
    </div>
  );
}
function MetricControls({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (v: Metric) => void;
}) {
  return (
    <div className="metric-controls" aria-label="Projection metric">
      {(
        [
          ["savings", "Savings"],
          ["netWorth", "Net Worth"],
          ["netCashFlow", "Cash Flow"],
          ["debt", "Debt"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          aria-pressed={metric === key}
          className={metric === key ? "selected" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function MonthSlider({ ping }: { ping: PingController }) {
  return (
    <div className="month-slider">
      <label htmlFor="month">{ping.baseline[ping.month].date}</label>
      <input
        id="month"
        aria-label="Inspect projection month"
        type="range"
        min="0"
        max="36"
        value={ping.month}
        aria-valuetext={ping.baseline[ping.month].date}
        onChange={(e) => ping.setMonth(Number(e.target.value))}
      />
      <span>36 months</span>
    </div>
  );
}
function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div>
      <span>{label}</span>
      <b>
        <AnimatedValue value={amount} />
      </b>
    </div>
  );
}
function FinancialColumn({
  title,
  subtitle,
  rows,
  totalLabel,
  total,
}: {
  title: string;
  subtitle: string;
  rows: string[][];
  totalLabel: string;
  total: number;
}) {
  return (
    <section className="financial-column">
      <header>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      <div className="financial-total">
        <b>
          <AnimatedValue value={total} />
        </b>
        <span>{totalLabel}</span>
      </div>
      <details className="financial-detail">
        <summary>
          View breakdown <ChevronDown size={15} />
        </summary>
        <div className="financial-rows">
          {rows.map(([label, value, note]) => (
            <div className="financial-row" key={label}>
              <div>
                <span>{label}</span>
                {note && <small>{note}</small>}
              </div>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
function SettingRow({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span>{value}</span>
    </div>
  );
}
function Updates({
  ping,
  onSelect,
}: {
  ping: PingController;
  onSelect: (u: Universe) => void;
}) {
  const latest = ping.state.changes[0];
  return (
    <>
      <div className="page-heading">
        <button
          className="secondary-button"
          onClick={() =>
            ping.setState((s) => ({
              ...s,
              notices: s.notices.map((n) => ({ ...n, read: true })),
            }))
          }
        >
          <CheckCheck size={15} /> Mark all as read
        </button>
      </div>
      {latest && (
        <section className="chart-panel update-comparison">
          <div className="update-heading">
            <h2>Your new starting point</h2>
            <p>“{latest.prompt}”</p>
          </div>
          <div className="before-after">
            <div>
              <span>BEFORE THE UPDATE</span>
              <b>{money(simulate(latest.before)[36].netWorth)}</b>
              <small>Baseline net worth in 3 years</small>
            </div>
            <ArrowRight size={20} />
            <div>
              <span>WITH YOUR NEW REALITY</span>
              <b>{money(ping.baseline[36].netWorth)}</b>
              <small>Baseline net worth in 3 years</small>
            </div>
          </div>
          <ProjectionChart
            series={[
              {
                id: "after",
                name: "After update",
                color: "#48745b",
                rows: ping.baseline,
              },
              {
                id: "before",
                name: "Before update",
                color: "#a6aea8",
                rows: simulate(latest.before),
                dashed: true,
              },
            ]}
            month={ping.month}
            onMonth={ping.setMonth}
            profile={ping.profile}
          />
          <div className="chart-legend">
            <span>
              <i style={{ background: "#48745b" }} />
              After update
            </span>
            <span>
              <i className="dashed" />
              Before update
            </span>
          </div>
          <div className="ripple-universes">
            {ping.state.universes.map((u) => {
              const prev = assess(latest.before, u),
                next = assess(ping.profile, u);
              return (
                <button key={u.id} onClick={() => onSelect(u)}>
                  <b>{u.name}</b>
                  <span>
                    {money(prev.rows[36].netWorth)} <ArrowRight size={12} />{" "}
                    {money(next.rows[36].netWorth)}
                  </span>
                  <span className={`status ${!next.viable ? "warning" : ""}`}>
                    {!prev.viable && next.viable ? "Newly viable" : next.status}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="notices">
        {ping.state.notices.map((n) => (
          <button
            key={n.id}
            className={`notice ${n.read ? "read" : ""}`}
            onClick={() => {
              ping.setState((s) => ({
                ...s,
                notices: s.notices.map((v) =>
                  v.id === n.id ? { ...v, read: true } : v,
                ),
              }));
              const u = ping.state.universes.find((u) => u.id === n.universeId);
              if (u) onSelect(u);
            }}
          >
            <span className="notice-icon">
              <Bell size={17} />
            </span>
            <div>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
              <small>
                {new Date(n.time).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            </div>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <button
        className="primary-button update-reality-action"
        onClick={() => ping.openChat("reality")}
      >
        <RefreshCw size={14} /> Update reality
      </button>
    </>
  );
}
