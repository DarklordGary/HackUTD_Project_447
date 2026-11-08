import type { FinancialEvent, Profile, Projection } from "./types";
import { eventAmountLabel, money, monthLabel } from "./engine";
import { signedMoney } from "./results";

export function HorizonOutcomes({
  row,
  baseline,
}: {
  row: Projection;
  baseline?: Projection;
}) {
  return (
    <section className="horizon-outcomes" aria-label="Horizon outcomes">
      <div>
        <span className="eyebrow">AT 36 MONTHS · {row.date}</span>
        <h2>Projected outcomes</h2>
      </div>
      {(
        [
          ["Net worth", "netWorth"],
          ["Savings", "savings"],
        ] as const
      ).map(([label, key]) => (
        <div key={key}>
          <span>{label}</span>
          <strong>{money(row[key])}</strong>
          {baseline && (
            <small>
              {signedMoney(row[key] - baseline[key])} vs Main Reality
            </small>
          )}
        </div>
      ))}
    </section>
  );
}
export function LiquidityObservation({
  minimum,
  onMonth,
}: {
  minimum: Projection;
  onMonth: (month: number) => void;
}) {
  return (
    <div className="liquidity-observation">
      <div>
        <b>Minimum liquid funds</b>
        <span>
          {money(minimum.liquid)} checking + savings · {minimum.date} · Month{" "}
          {minimum.month}
        </span>
        <small>Across months 0–36; first month shown when tied.</small>
      </div>
      <button
        className="secondary-button"
        onClick={() => onMonth(minimum.month)}
      >
        Jump to month {minimum.month}
      </button>
    </div>
  );
}
export function ScenarioInputs({
  events,
  sourceEvents = [],
  profile,
  historical,
}: {
  events: FinancialEvent[];
  sourceEvents?: FinancialEvent[];
  profile: Profile;
  historical: boolean;
}) {
  const pending = events.filter(
    (e) =>
      !e.fulfilledBy &&
      !(e.kind === "salary" && e.salary?.status === "fulfilled"),
  );
  return (
    <div className="essential-inputs">
      <h3>Scenario inputs</h3>
      {pending.map((e) => (
        <p key={e.id}>
          <b>{e.label}</b> · {eventAmountLabel(e)} ·{" "}
          {monthLabel(profile, e.month)}
          {sourceEvents.some(
            (original) => JSON.stringify(original) === JSON.stringify(e),
          )
            ? " · Inherited from source"
            : ""}
          {e.salary?.purpose === "prerequisite"
            ? historical
              ? " · Snapshot prerequisite"
              : " · Future prerequisite"
            : ""}
          {e.estimated ? " · Provisional scenario estimate" : ""}
        </p>
      ))}
      {pending.length === 0 && (
        <p>
          {events.length
            ? "Scheduled changes have been fulfilled in Main Reality."
            : "No scheduled changes to Main Reality."}
        </p>
      )}
    </div>
  );
}
