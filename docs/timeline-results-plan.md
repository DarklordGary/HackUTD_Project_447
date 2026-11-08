# Timeline results: facts without verdicts

Status: phases 1 and 2 implemented on 2026-11-08, with verification limits recorded below. Phase 3 remains deferred.

## Product decision

Remove evaluative timeline labels (On track, Worth exploring, Needs a rethink, Newly viable) and equivalent claims in generated summaries and notifications. Present calculated amounts, dates, comparisons, and assumptions so users can assess the tradeoffs themselves. Do not replace the badge with another score, traffic light, or recommendation.

Keep Archived and Realized as plain lifecycle text near the title. Keep salary prerequisite fulfillment, tool execution status, connection feedback, and accessible role="status" announcements; those describe different behavior.

## Individual timeline requirements

Keep this proposal in text. The wireframe has been discarded, and no visual layout has been approved. The following describes information and interaction requirements; placement, hierarchy, and visual design remain open.

1. Header: All timelines, timeline name, description, parent relationship, and lifecycle text when relevant. Branch this timeline is the primary action; Modify assumptions and More actions remain secondary.
2. Horizon outcomes: explicitly labeled **At 36 months**, with projected net worth and savings and signed dollar differences from Main Reality at the same month. These outcomes stay fixed at month 36 when the selected inspection month changes.
3. Main chart: retain Savings / Net worth / Cash flow / Debt, the Main Reality comparison, export, and month slider. Label the selected metric, month, and signed difference together. Today / 1 year / 2 years / 3 years are month-selection shortcuts; they do not shorten the simulated horizon. Hover is a temporary preview; click, keyboard, or touch selects a month and synchronizes the breakdown. Preserve map-to-detail event-month selection.
4. Liquid funds observation: the minimum checking-plus-savings amount across months 0–36, its date, and a Jump to month action. Ties choose the first month. Show this as an uncolored fact. Do not call it the worst month: low liquid funds and low cash flow are different measures.
5. Selected-month breakdown: date, income, living expenses, cash flow, savings, debt, and an expandable full breakdown. Distinguish monthly flows from end-of-month balances. Keep baseline differences near the relevant values rather than adding another dashboard.
6. Scenario context: concise scenario inputs, grouped scheduled events, milestones, and detailed assumptions. Essential future prerequisites and provisional estimates remain visible. Retain conversational editing as the initial editing path. Choose placement during a future UI design pass.
7. Keep the compact Ask Ping composer accessible and reserve space for it. It must not obscure content or focused controls when the keyboard opens.

Reserve observations, if included, are optional factual details: first month below a disclosed benchmark, the liquid amount, the benchmark amount, and the size of the difference. Describe three months of modeled living expenses as a comparison benchmark, not a universal requirement or certification. A negative balance remains visible as a number.

## Phase 1 — Remove verdicts consistently

### UI and styles

- src/App.tsx: remove timeline header and reality-update assessment badges; preserve lifecycle information as text. Replace the Settings Viability rule row with a neutral Reserve comparison explanation if the benchmark remains exposed.
- src/styles.css and src/responsive.css: remove only obsolete detail-header/ripple badge selectors and rebalance reality-update rows. Keep the shared .status styling used by the numerical monthly cash-flow display. Do not globally remove status attributes or classes.
- Reality-update rows retain timeline name and before/after projected net worth.

### Copy and model-facing data

- src/state.ts explain(): summarize numeric outcomes and relevant shortfall/cash-flow dates without viable/within reach judgments. Report actual negative-cash-flow months; do not use month 36 alone to describe every month in the final six.
- src/state.ts reality updates: neutral notification titles, before/after amounts, and explicit changes. Stop generating 'now viable' and 'now within reach'.
- server/agent.ts forecast(): omit the evaluative status and viable fields from model-facing results. Retain checkpoints, minimum liquidity, milestones, and factual reserve observations with an explicit benchmark description. Make boundary inclusion consistent with the UI (months 0–36).
- Remove viabilityRule from model-facing assumptions; replace with a factual benchmark definition only where useful. Update the agent instruction about affordability to require grounding answers in calculated amounts and assumptions and prohibit categorical timeline verdicts.
- Inspect all forecast consumers, preview summaries, and answer fixtures. Do not add natural-language keyword routing or alter scenario interpretation.
- README.md, docs/ui-design.md, and the current implementation documentation: describe the neutral result presentation. Mark historical handoff wording as historical if retained.

### Compatibility

- Keep assess() reserve calculations and its internal viable boolean initially. They support existing impact snapshots and regression tests; hiding evaluations does not require changing simulation behavior.
- The engine's display status can be removed once its UI/server consumers are removed. Verify there are no remaining consumers before deleting it.
- Keep optional stored impacts with beforeViable/afterViable readable in types.ts and contracts.ts for this release. Do not make new fields mandatory or discard saved workspaces. A later schema cleanup may retire these booleans separately.
- Existing saved messages and notification titles remain historical text. Do not rewrite conversations or reset user storage to eliminate old wording.
- No SpacetimeDB schema change or migration is expected for this phase; confirm during implementation.

## Phase 2 — Improve the individual result view

- Extract small reusable pieces where useful: horizon outcomes, selected-month comparison, and liquid-funds observation. Calculate them from existing projection arrays; the deterministic engine remains the sole source of financial numbers.
- Add dollar deltas at matching months. Label signed differences neutrally: a positive debt difference means more debt, not an improvement. Avoid percentage deltas around zero or negative baselines.
- Add the minimum-liquidity jump and month shortcuts. Ensure all selections update the chart, label, slider, and breakdown together; hover must not silently change the persistent selection.
- Use universe.finalProfile for archived projections, chart dates, and event labels. A historical plan compared with today's Main Reality must explicitly disclose the different snapshots; omit deltas when dates cannot be aligned safely. Do not silently present unlike dates as a comparison.
- Fix Compare with original: for a child/revision use its actual source, and for an independent timeline compare against Main Reality. The existing compare screen may need to represent the baseline explicitly; do not substitute an arbitrary universe. If a source is missing, say so and offer Main Reality.
- In chart annotations and event lists, group every same-month event under an accessible summary and expose the complete group. Replace the silent five-marker cap with collision-aware labels and accessible markers, or a clearly labeled all-events list if chart labels are suppressed.
- Keep detailed assumptions collapsed, but surface meaningful conditions and estimate provenance. A fulfilled prerequisite must not appear pending; avoid duplicating inherited scenario changes as newly added ones.

## Phase 3 — Optional additions after the core revision

- Inline event date/amount editing and undo for removal. This is a separate feature: group rescheduling, salary metadata, financed purchases, fulfilled events, stale operations, and persistence need explicit validation. Do not casually mutate complex events through a generic amount field.
- Numeric upfront/ongoing cost summaries, with event-kind semantics and timing defined first. Absolute salary/rent values are not deltas; financed purchases must not be counted twice.
- Scenario sensitivity controls only if requested later. Do not invent confidence intervals or probabilities from the deterministic model.

## Verification and acceptance

Run the appropriate existing UI, engine, lifecycle, and server tests, followed by the production build. Keep numerical engine assertions unchanged unless a distinct calculation bug is found. Update the Newly viable UI assertion and copy/tool-output expectations in App.test.tsx, engine.test.ts, and server/agent.test.ts as applicable. Existing viability calculation tests may remain as internal compatibility tests.

Add focused behavior coverage for matching-month deltas, minimum-liquidity ties/boundaries, synchronized month navigation, grouped events, baseline compare routing, and archived date alignment. Verify that old saved workspaces still load and salary fulfillment still works. Do not write tests that merely mirror markup.

Review desktop, 768px, and 390/320px widths; touch selection; keyboard navigation and visible focus; screen-reader month labels; reduced motion; long timeline names; no events; many events; negative balances; absent comparison source; archived and realized plans; and the mobile keyboard/composer interaction.

Done means:

- New UI, chat summaries, notifications, and model tool outputs contain no categorical timeline verdicts.
- Users can identify the 36-month outcome, difference from Main Reality, minimum liquid balance, and selected month's finances without deciphering a badge.
- Lifecycle information, financial numbers, saved history, branching, and reality-update behavior remain intact.
- No unrelated app redesign or data reset is included.

## Implementation order

1. Remove verdicts from UI/copy/model outputs and update compatibility tests.
2. Add shared numeric observations and coherent month/comparison behavior.
3. Define the detail layout and responsive arrangement during implementation using the existing visual style; the discarded wireframe is not a reference.
4. Complete event grouping, comparison routing, and focused regression checks.
5. Update documentation and review the result in the browser.

Phases 1 and 2 form the implemented release. Phase 3 is explicitly deferred.

## Implementation outcome — 2026-11-08

Phases 1 and 2 are implemented. The discarded wireframe was neither recreated nor used. The existing paper/sage visual system now leads with fixed horizon outcomes, followed by the chart and inspected-month finances. Small reusable result components and pure observations use engine projection arrays. Branch/edit actions and source relationship appear in the header. No engine arithmetic, storage reset, history rewrite, database schema/migration, commit or PR was introduced.

- Removed detail and reality-update verdict badges, engine display status, new summary/notification judgments and forecast verdict fields. Kept lifecycle text, numerical cash-flow styling, internal `assess().viable`, salary fulfillment and legacy stored impact fields. Model instructions require factual calculated answers; no keyword router was added.
- Added matching-date signed dollar comparisons, fixed 36-month outcomes, first-tie minimum liquid funds across months 0–36, shortcuts and liquidity jump. Click/tap selection uses pointer position rather than stale hover. Keyboard arrows/Home/End and the shared slider select the same inspection month. Hover remains temporary.
- All same-month events are grouped. Chart labels are deliberately suppressed to prevent collisions; complete labeled all-events disclosure and accessible markers expose every event without the former five-marker cap. Side context exposes essential inputs, estimate provenance, inherited source events and unfulfilled prerequisites. Full assumptions remain collapsed.
- Compare with original uses revision source or parent, and Main Reality for independent/missing-source paths. Missing source is disclosed. Saved profiles drive historical chart/event dates and server monthly/compare forecasts. Misaligned start dates suppress chart overlay/deltas; comparison columns show their own dates. Snapshots with matching starts still disclose their different profile basis.

Validation: `npm test` passes **106 tests in 11 files**; `npm run build` and `npm run db:check` pass. The build emits existing upstream Zod/Rollup annotation warnings. Engine numerical assertions were retained. Focused added coverage includes month navigation and hover persistence, horizon invariance/matching-month deltas, minimum-liquidity ties and opening/final boundaries, grouped events beyond five months, source resolution/fallback and archived date alignment. Existing lifecycle, salary reconciliation and saved-workspace tests pass.

Browser review used an isolated incognito workspace on port 5174 with test fixtures and no live persistence. Desktop 1280px, 768px, 390px and 320px widths showed no document overflow; the composer remained outside the scrolling content. Existing focus rules and reduced-motion styles were retained. A final browser keyboard End-key probe synchronized the slider and breakdown at month 36 while leaving horizon outcomes fixed. A simulated 400px keyboard viewport retained the focused input and separated composer/content bounds. Physical touch selection, real screen-reader announcements and the actual on-device keyboard were not verified. No new live Nemotron request or live database integration suite was run; prompt compliance for arbitrary future model answers is not guaranteed by offline tests. Historical archived profiles that were absent before the existing migration cannot be reconstructed.

Deferred: all phase 3 additions (inline event editing/undo, cost summaries and sensitivity controls), later impact-boolean schema cleanup, and physical-device/live-provider verification. These do not alter the implemented financial calculations or saved history.

Changed paths: `src/App.tsx`, `src/TimelineResults.tsx`, `src/results.ts`, `src/components.tsx`, `src/TimelineCanvas.tsx`, `src/state.ts`, `src/engine.ts`, `src/styles.css`, `src/responsive.css`, `server/agent.ts`; coverage in `src/App.test.tsx`, `src/results.test.ts`, `src/engine.test.ts`, `server/agent.test.ts`; documentation in `README.md`, this plan, `docs/ui-design.md`, `docs/conversational-timeline-implementation.md`, and the historical notice in `docs/conversational-timeline-handoff.md`.

### Follow-up: conversational actions

The user's subsequent instruction supersedes the earlier header-action requirement: timeline branching, assumption changes, event removal and archive/restore are handled through Ask Ping. Their manual buttons and More actions menu were removed from timeline detail. Compare with original is now direct read-only navigation. Chart, export, date/month and event-inspection controls remain. Regression coverage verifies the removed actions are absent, inspecting preserves saved data, and a removal-only chatbot response still edits the exact event ID.
