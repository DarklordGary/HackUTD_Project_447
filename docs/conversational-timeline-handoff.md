# Implementation handoff: conversational timeline lifecycle

Historical handoff: evaluative wording below describes the earlier specification, not current presentation. The implemented neutral result behavior is documented in `timeline-results-plan.md` and `conversational-timeline-implementation.md`.

## Mandate and scope

The user wants a text-first financial alternate-universe app that can explore a plan, explore a connected revision, respond to real life changes, recognize when a plan has happened, and start a new possibility from that updated reality.

This document is an implementation brief, based on inspection of the current repository. No application changes were made while preparing it. The user authorized judgment about implementation choices, but specifically requested this report for handoff to another model. A future implementing model should execute the work, not stop at another plan.

Preserve the current product direction: the universe map is the primary view; the always-visible text composer is the primary creation surface. Do not restore Map/List controls, the New universe button, the empty-state sales copy, the lower legend, or the lower interaction instructions. Main Reality starts with zero hypothetical branches. Preserve response logging.

## Required sequential journey

| Turn | User input | Required state transition | Required explanation |
| --- | --- | --- | --- |
| 1 | “Can I move to New York?” | Create an independent NYC possibility from Main Reality. Add estimated move costs, rent and relevant recurring expenses. Keep actual finances unchanged. | Explain the computed result. In the demonstration fixture this plan must be nonviable, with a concrete reason and month. |
| 2 | “What if I got a raise of X and waited 3 months before moving?” | Create a child alternative in the NYC family. Inherit the plan, add a hypothetical raise and reschedule the original move three months later. Preserve the original NYC plan. | Explain what changed and whether it fixes the original affordability problem. |
| 3 | “I got a raise of Y.” | Apply Y to actual income, reconcile relevant assumptions, and recalculate all active possibilities. Do not create another hypothetical universe for this statement. | Identify specific plans whose status changed. In a fixture where Y is sufficient: “Your New York plan is now viable.” |
| 4 | “I’ve moved to New York.” | Resolve the matching plan, record the actual move in Main Reality, archive the completed hypothetical plan, and update remaining active possibilities consistently. | State that New York is now reality and identify which plan was archived. Disclose any unresolved actual cost assumptions. |
| 5 | “What if I bought a boat?” | Create an independent possibility from the updated New York reality, including the actual Y salary. Do not inherit a hypothetical NYC salary or replay its moving costs. | Explain calculated affordability. Show debt only if borrowing is actually modeled; otherwise describe the cash shortfall. |

X and Y are parameters, not fixed outcome guarantees. Tests must supply actual amounts and dates. A small Y must not produce a positive response just to match the sample narrative. Literal input containing “X” or “Y” requires clarification.

## Product decisions for implementation

### 1. Meaning of “merges into the New York one”

Implement a connected alternative within the same NYC goal family. It inherits the destination/plan while changing salary and timing. Preserve both versions and their separate financial outcomes.

Use the existing parent-child graph for financial lineage. A different salary and move date do not make two financial states identical, so do not combine their balances or union their events. A shared destination can be communicated visually through the connected family and labels. If visual convergence is added, represent it separately as a shared goal/realization marker, not a financial merge. General multi-parent financial DAG merging is outside this journey's requirements.

The follow-up “waited 3 months before moving” reschedules the existing move. Move its linked moving expense, rent activation, local expense adjustments, and related deposit/refund events together while preserving their relative offsets. It must not accidentally add a second move. An explicit later move to another city is a separate event group.

### 2. Hypothetical salary versus actual salary

Represent the user's meaning rather than flattening every salary change into a replacement number:

- “A raise of $10,000” is an annual gross increase unless context specifies otherwise.
- “A salary of $90,000” is an absolute annual gross salary.
- Percent raises require an explicit basis and deterministic calculation.
- Missing pay period or other material ambiguity should produce one focused clarification.

Store whether a hypothetical salary assumption is a delta or an absolute target, its baseline reference, effective date, and purpose. Both salary and rent currently use absolute replacement events, which cannot express all of these distinctions safely.

When Y becomes real, do not silently stack a duplicate assumed raise onto Y. Treat the ordinary step-two assumption as a prerequisite for the NYC plan, referenced to the baseline at creation. If Y satisfies it, mark it fulfilled and project from actual income. If Y falls short, retain the remaining conditional target explicitly. Preserve explicitly counterfactual salaries or an explicitly additional future raise as separate assumptions; explain conflicts. Never discard the original assumption's provenance.

For the original NYC plan with no hypothetical salary, simply project it against actual Y. Report the original and revised versions distinctly so “New York is viable” is not ambiguous.

### 3. Active, archived and realized plans

Introduce a lifecycle distinction between active, manually archived, and realized plans. Reuse the existing archived field for compatibility if useful, but retain an archive reason, realization timestamp, and link to the reality change.

Only active plans should produce automatic viability-change notifications. Archived/realized plans retain their historical events, conversation and final assessment; they must not be presented as still pending. The model may inspect archived plans deliberately when resolving an explicit reference.

At step four, realize the uniquely matched plan, not every scenario involving New York. Prefer explicit reference, then the plan the user has been discussing, then a unique compatible goal. If material ambiguity remains between the original and delayed versions, ask which version actually happened. Do not silently mark every sibling completed. Other active NYC alternatives can remain active but must be rebased or marked superseded/conflicted, rather than continuing to forecast an obsolete second move.

### 4. Actual move means more than archiving

Record actual location, effective date, recurring rent/local expense changes, and actual one-time costs when known. Reuse already-established estimates as disclosed provisional values when reasonable; do not ask again for information the workspace already contains. Ask for a material missing fact if no defensible provisional value exists.

Do not copy the entire hypothetical future into Main Reality. In particular, do not promote hypothetical X, future purchases or unrelated assumptions. Retain actual Y. Apply each realized cost once and retain the archived projection as history.

Use a structured actual-event ledger with stable event IDs, dates and source links as the preferred implementation. Keep the profile as an opening snapshot and derive effective current facts/projections through one deterministic projection path. A different architecture is acceptable if it proves the same date, replay and reconciliation invariants. Do not implement both a ledger debit and a profile debit for the same move.

Define the assessment/current date explicitly. “I’ve moved” is effective now unless specified otherwise; it must not be booked at a previously forecast future move date. The current model has a fixed profile startDate and month indices 1–36, so date-to-month mapping, events at the current boundary, and past-versus-future realized costs require explicit handling. Do not silently reset balances, advance several months of income, or change the start date without rebasing remaining events consistently.

### 5. Boat purchase and debt

The text “bought a boat” supplies neither price nor financing. Use disclosed scenario estimates for price and recurring ownership costs where appropriate; otherwise ask a concise clarification. Financing terms must be explicit user facts or clearly disclosed scenario assumptions, never silently invented facts.

To deliver an actual severe-debt demonstration, add a structured financed-purchase/new-loan event: purchase price, down payment, financed principal, APR, payment/term, start date, and recurring running costs. Calculate origination, interest, payments and outstanding balance in the engine. Check payment sufficiency and negative amortization behavior.

Keep these cases separate:

- Cash purchase: cash declines; no new loan balance.
- Financed purchase: down payment reduces cash and financing creates a liability. Do not also debit the full purchase price from cash unless loan proceeds are recorded consistently.
- Unsupported or unspecified financing: describe a cash shortfall or ask a question; never label negative checking as modeled loan debt.

State whether boat asset value is excluded from net worth. It is acceptable to exclude it for this prototype if the result is clearly labeled; do not imply the projection includes asset equity or depreciation. “Severe debt” should be supported by outstanding principal, debt service/cash flow and a time point, not just an adjective.

## Verified current architecture and gaps

| Location | What exists | Work needed |
| --- | --- | --- |
| `src/types.ts`, `src/contracts.ts` | Profile, Universe, optional archived/parentId, flat monthly events and schema-validated interpretations. Actual updates support salary, rent, bonus and credit payoff. | Extend lifecycle, dates, event grouping/provenance, salary semantics, actual move/realization commands and financing types. Keep duplicated event schemas aligned. |
| `server/agent.ts` — `select_action`, `createToolSession`, `runNemotronAgent` | Model chooses the operation; tool availability is scoped to it. Previews use an isolated snapshot. Finishers return a command to the app. | Add structured realization and reconciliation tools/actions. Keep previews read-only, identifiers exact, and arithmetic in deterministic tools. Update phase gating and tool descriptions alongside schemas. |
| `server/agent.ts` — `preview_reality_update` | Runs applyReality on a snapshot and returns before/after projections. | Return structured per-plan status transitions, fulfilled/conflicting assumptions, realized IDs and archive effects. Filter automatic impact analysis to active plans. |
| `src/state.ts` — `applyReality` | Changes profile fields, assesses all universes, appends notices/change snapshots and announces newly viable plans. | Exclude archived plans from live alerts; reconcile assumptions; atomically realize/archive; keep actual events idempotent; return structured impact data. |
| `src/usePing.ts` — `send` | Applies returned operation, merges events, stores parentId and selects new branches. Rejects stale results if profile/universe references changed. | Apply richer commands atomically, deduplicate request IDs, maintain conversation context, and clear selection when its plan becomes realized/archived. Ensure stale detection covers added state fields. |
| `src/interpreter.ts`, `server/nemotron.ts` | Request includes profile, selected universe, all universes and last 20 messages. Timeline message histories are stripped from request context. | Include sufficient structured goal/reality context so reference resolution does not depend only on the selected item or the last 20 texts. Validate new command variants end to end. |
| `src/engine.ts` — `simulate`, `assess` | Deterministic 36-month cash flow; salary/rent replace values; expenses are cash events. Only opening-profile debts amortize. Negative checking exposes insolvency. | Add new debt origination and effective actual events; canonicalize scenario assumptions; calculate transitions and shortfall months. Review viability's use of baseline expenses for its three-month reserve and first rent event as its evaluation boundary. Document the final rule. |
| `src/TimelineCanvas.tsx` | parentId establishes graph lineage; fork position is inferred from event differences. | Preserve graph correctness after rescheduling, archiving and realization. Show active descendants meaningfully when their parent is archived. Consider an explicit realization marker; no fake financial merge. |
| `src/App.tsx` | Main Reality, branch picker, comparison, manual archive/restore, always-visible composer. | Reflect automatic completion and per-plan transitions concisely. Keep the experience text-first; no new creation wizard or mandatory approval clicks. |
| `src/sync.ts`, `src/sync-live.ts`, `spacetimedb/src/index.ts` | Local storage plus a JSON workspace aggregate in SpacetimeDB, optimistic revision writes. | Persist the whole transition as one aggregate change. Preserve conflict handling. Additional JSON fields need migration/validation even if no table schema change is necessary. |
| `src/workspace-upgrade.ts` | examplesVersion 2 clears older demo branches once; later created branches survive. | Preserve the requested clean baseline. Add non-destructive migrations for new fields; do not clear users' new scenarios again. |
| `server/nemotron-client.ts`, `server/nemotron-log.ts` | Raw HTTP response and full request body append to logs/nemotron.jsonl before SDK parsing, including malformed/error responses. | Preserve this. Add correlation IDs for complete multi-round user turns and applied commands if useful. Do not log credentials. |

## Command and consistency requirements

Keep the existing preview-then-apply architecture. A reality/realization preview should include the proposed actual changes, matching plan, assumptions to fulfill or flag, lifecycle changes, before/after projections, and active-plan impact summary. The application must apply exactly that validated transition against the snapshot it was previewed from.

Use a discriminated command result or equivalently strict schema so a move can update reality and archive the matched plan in one validated operation. Do not send a broad model-written replacement AppState. Tools should validate IDs, ownership within the snapshot, event bounds, amounts and lifecycle transitions.

Separate the conversation's active goal from UI selection. At present the in-memory thread can span sequential turns, but navigation may clear it, reality turns are not stored as a durable workspace conversation, and the selected NYC universe can remain in context after a reality update. Persist the minimal durable conversation/goal context required for refresh and navigation continuity. A fresh unrelated “boat” request must start from Main Reality even if NYC remains selected; an explicit “after this hypothetical move” must inherit the selected hypothetical instead.

Realization and reality updates must be idempotent across retries, duplicate submissions and sync restoration. No repeated move cost, salary increase, debt origination, archive action or notification. Use stable operation IDs and preserve existing revision conflicts. On stale data, re-preview or return an actionable error; never overwrite a newer workspace with an old preview.

The model chooses intent and parameters. Deterministic code validates and calculates. Avoid keyword-only routing, hardcoded affirmative outcomes, balance arithmetic in prose, or fabricated successful tool results. Keep clarification targeted to genuinely missing material information.

## Acceptance tests required for completion

1. **Five-turn journey:** Start with zero branches. Use fixed dates and explicit X/Y/boat inputs. Assert state after every turn, not just chat text. Original NYC remains intact after its child is created. Actual Y appears in the new baseline. Step four realizes exactly the matched plan. Boat begins from actual NYC/Y with no repeated moving expense or hypothetical X.
2. **Calculated outcomes:** Select fixture values such that original NYC is nonviable and actual Y crosses the documented threshold. Independently assert the financial engine values. Add a low-Y negative case so the answer cannot always say viable. A boat loan fixture must exhibit a real liability and supported distress metrics; add a viable inexpensive-boat counterexample.
3. **Reschedule correctness:** Delay all linked move events by three months, preserve offsets and stable IDs, retain unrelated events, and leave the parent unchanged. Test a second later-city move to ensure it is added rather than treated as the same move. Handle a delay extending beyond the 36-month horizon explicitly.
4. **Salary reconciliation:** Test annual dollar delta, absolute salary, percentage raise, Y greater/equal/less than X, fulfilled prerequisite, intentionally additional future raise, and conflicting absolute counterfactual. No double raise or unexplained override.
5. **Active-plan impact:** Recalculate all active plans, including ones not selected. Exclude archived/realized plans from automatic alerts. Emit a newly-viable transition only on the actual threshold crossing, with correct version/name. Keep nonviable plans nonviable when appropriate.
6. **Realization:** Test explicit plan ID/reference, unique contextual match, ambiguous NYC versions, differing actual rent/cost, missing material facts, preserved Y, unrelated future events, exact-once costs, archive reason, retained history and correct active descendants.
7. **Time semantics:** Test now, past and explicit future dates; same-month changes; month boundaries; rescheduling around the current date; and reload after realization. Opening balances and realized costs must not be replayed or silently advanced.
8. **Financing arithmetic:** Verify principal, down payment, monthly interest, payments, payoff and running costs at cent precision. Test zero APR, insufficient payment, borrowing cap/invalid terms, cash purchase, and no double debit. Keep cash shortfall distinct from outstanding debt and disclose excluded asset value.
9. **Protocol tests:** Mock Nemotron's structured calls to cover each new action and correction after validation errors. Assert real statements can update reality while a branch is selected and unrelated boat/China alternatives do not inherit it. Ensure the correct finishing tool is available only after a valid preview.
10. **UI, persistence and retries:** Drive all five turns through the composer; check map lineage/lifecycle and feedback, refresh restore, archived inspection, duplicate submit, concurrent workspace changes and migration. Preserve new branches after reset migration and maintain an accessible mobile text input.
11. **Live smoke test:** After deterministic and mocked tests pass, run the actual Nemotron deployment through the journey. Capture turn-correlated logs. Report the actual results and any clarifications/failures; do not treat mocked intent choices as proof the live model chose correctly.

## Suggested implementation order

1. Establish the current test baseline and write the sequential fixture/specification.
2. Add schemas, salary/goal provenance, lifecycle metadata, durable context and non-destructive migrations.
3. Implement pure salary reconciliation, actual-event/realization transitions and active-plan impact summaries.
4. Implement financing and date behavior in the deterministic engine with numerical tests.
5. Add preview tools/actions and validated atomic application; extend server/client protocol tests.
6. Integrate concise conversation feedback and graph lifecycle rendering without reintroducing removed UI.
7. Run the complete test/build checks, then the live smoke test, and deliver evidence and remaining limitations.

## Verification baseline at handoff

Checked on 2026-11-08 in this workspace:

- `npm run build`: passes (upstream Rollup annotation warnings from Zod).
- `npm test -- --reporter=json --outputFile=.spacetime/handoff-test-results.json`: 56 tests; 53 pass, 3 fail.
- Failures at this handoff: App demo journey expects a removed “Your financial multiverse” heading; TimelineCanvas Chicago marker test dereferences an undefined example; TimelineCanvas calendar test expects “Feb 2027, month 3” but current ticks differ. Inspect and reconcile these existing expectations without weakening meaningful coverage. Do not count them as newly introduced regressions or claim the baseline suite is green.
- No live five-turn Nemotron verification was performed for this report. Code inspection establishes available mechanisms, not guaranteed live intent classification.
- Existing local changes are present. Preserve the user's current work; do not reset the repository. This report's only source-tree addition is this Markdown document.

## Definition of done

The five turns run sequentially through the existing composer, with distinct hypothetical and actual facts, a preserved NYC alternative, computed active-plan updates after actual Y, a completed move incorporated into Main Reality and archived exactly once, and an independently modeled boat future based on that new reality. Financial claims come from the engine. Reload and retries preserve the same result. Deliver implementation details, test evidence and any explicit model limitations.
