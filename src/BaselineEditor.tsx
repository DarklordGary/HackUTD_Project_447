import { useState } from "react";
import { currentFacts } from "./engine";
import type { Profile } from "./types";
import type { Interpretation } from "./contracts";
import "./baseline-editor.css";

export type BaselineChanges = NonNullable<Interpretation["reality"]>;
const groups = [
  ["Income", [["annualSalary", "Gross annual salary", false, 0, 10000000], ["taxRate", "Effective tax rate (%)", true, 0, 100]]],
  ["Liquid assets", [["checking", "Checking balance", false], ["savings", "Savings balance", false, 0], ["savingsRate", "Savings interest (%)", true, 0, 100]]],
  ["Monthly expenses", [["rent", "Monthly rent", false, 0, 100000], ["recurring", "Bills & subscriptions", false, 0], ["variable", "Variable spending", false, 0], ["obligations", "Other obligations", false, 0]]],
  ["Investments", [["investments", "Investment balance", false, 0], ["contribution", "Monthly contribution", false, 0], ["investmentReturn", "Annual return assumption (%)", true, -99, 100]]],
] as const;

export function BaselineEditor({ profile, onSave, onCancel }: {
  profile: Profile; onSave: (changes: BaselineChanges, original: Profile) => void; onCancel: () => void;
}) {
  // Freeze the source for this draft so a remote update cannot silently overwrite edits.
  const [original] = useState(profile);
  const [initial] = useState(() => ({ ...profile, ...currentFacts(profile) }));
  const [error, setError] = useState("");
  return <form className="baseline-editor" onSubmit={event => {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const changes: BaselineChanges = {};
    for (const [, fields] of groups) for (const [key, , percent] of fields) {
      const value = Number(form.get(key)) / (percent ? 100 : 1);
      // Compare in display units to avoid floating-point-only changes.
      if (Number(form.get(key)) !== Number((initial[key] * (percent ? 100 : 1)).toFixed(6))) changes[key] = value;
    }
    const debts = original.debts.map(debt => ({ ...debt,
      balance: Number(form.get(`${debt.id}-balance`)),
      apr: Number(form.get(`${debt.id}-apr`)) / 100,
      payment: Number(form.get(`${debt.id}-payment`)),
    }));
    if (debts.some((debt, index) => debt.balance !== original.debts[index].balance || debt.payment !== original.debts[index].payment || Number((debt.apr * 100).toFixed(6)) !== Number((original.debts[index].apr * 100).toFixed(6)))) changes.debts = debts;
    try { if (Object.keys(changes).length) onSave(changes, original); else onCancel(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your baseline. Please retry."); }
  }}>
    <h2>Edit baseline</h2><p>Save your current numbers to update projections and the starting point for new branches. Rates are percentages; expenses and contributions are monthly.</p>
    <div className="baseline-editor-grid">{groups.map(([title, fields]) => <fieldset key={title}><legend>{title}</legend>{fields.map(field => {
      const [key, label, percent] = field;
      return <label key={key}>{label}<input name={key} type="number" step="any" required
        min={field.length > 3 ? field[3] : undefined} max={field.length > 4 ? field[4] : undefined}
        defaultValue={Number((initial[key] * (percent ? 100 : 1)).toFixed(6))} /></label>;
    })}</fieldset>)}
    {original.debts.map(debt => <fieldset key={debt.id}><legend>{debt.name}</legend>
      <label>Balance<input aria-label={`${debt.name} balance`} name={`${debt.id}-balance`} type="number" step="any" min="0" required defaultValue={debt.balance} /></label>
      <label>APR (%)<input aria-label={`${debt.name} APR (%)`} name={`${debt.id}-apr`} type="number" step="any" min="0" max="100" required defaultValue={Number((debt.apr * 100).toFixed(6))} /></label>
      <label>Monthly payment<input aria-label={`${debt.name} monthly payment`} name={`${debt.id}-payment`} type="number" step="any" min="0" required defaultValue={debt.payment} /></label>
    </fieldset>)}</div>
    {error && <p role="alert">{error}</p>}
    <div className="baseline-editor-actions"><button className="primary-button" type="submit">Save baseline</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
