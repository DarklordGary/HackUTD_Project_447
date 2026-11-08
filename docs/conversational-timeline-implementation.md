# Conversational timeline lifecycle implementation

Implemented on 2026-11-08 from `conversational-timeline-handoff.md`.

## Behavior

- Fresh workspaces still start at Main Reality with no hypothetical branches. The existing map and composer remain the primary surfaces.
- Move groups link rent, one-time moving costs, recurring local adjustments and related refunds. A connected revision shifts the entire group while retaining stable event IDs, relative offsets and the original parent. A later move uses a new group.
- Salary assumptions retain delta/absolute/percent semantics, their original salary basis, effective month and prerequisite/additional/counterfactual purpose. Actual raises fulfill prerequisite targets without stacking them. Insufficient raises leave an explicit conditional target; additional and counterfactual salaries remain disclosed.
- Actual salary/rent changes and moves use a dated ledger. Opening salary/rent values are retained separately when current facts change. Move costs are booked only in the ledger, never also debited from profile cash. A current-boundary move changes initial liquid funds without advancing a month of income or resetting the projection origin.
- Realization records the matching move only, retains actual salary, archives exactly one plan with its source operation/date and historical profile, and marks corresponding move groups in remaining alternatives as fulfilled. Other hypothetical purchases and salaries are never promoted into reality. Established estimates remain explicitly provisional.
- Archived plans do not generate live impact alerts. Manually archived plans can be restored; realized plans remain historical. Active descendants remain available when their parent is hidden.
- Durable workspace conversation and active goal survive navigation/reload. Operation IDs make reality transitions idempotent, block duplicate applications and correlate raw provider logs. Existing optimistic database revisions still reject concurrent stale writes.
- Financed purchases debit only the down payment, originate principal, accrue monthly interest and amortize payments. Cash purchases originate no debt. Insufficient payments, invalid terms and borrowing above $1 million are rejected. Purchased asset value and depreciation are excluded.

The model selects intent, subject and parameters. Specialized move, revision, salary, realization and purchase tools construct validated events and preview deterministic calculations. Realization has its own tool phase, so a completed move cannot use the prior salary-update tool. Default realization resolves the durable active goal; explicit references may select another plan. Ambiguous compatible versions without context require clarification. Applied-preview explanations come from the engine rather than unverified model-written arithmetic.

## Financial/date rules

The reserve check uses each projected month's recurring living costs, including the active rent, local expense adjustments and financed-purchase running costs. It checks opening-boundary liquidity too. One-time costs reduce liquidity without inflating the recurring reserve. A plan also needs nonnegative cash flow throughout the final six months. Summaries identify the first reserve failure with its month, liquid balance and reserve target.

The projection remains anchored at the original opening snapshot. Calendar dates map deterministically to its monthly buckets. A November 2026 opening maps January 2027 to month 2. Same-month actual events use the current boundary; there is no daily proration. Actual dates before the opening snapshot are rejected with a correction message. Completed moves cannot be future dated; future moves remain hypothetical. The preview freezes its assessment date so midnight cannot change the applied transition.

## Verification

- `npm test`: **73 tests pass**, including the five-turn composer journey with a reload, low-Y cases, salary reconciliation, linked rescheduling, exact-once realization, ambiguity/reference resolution, mocked model protocol, archive migration and cent-level financing arithmetic.
- `npm run build`: passes. Existing upstream Zod/Rollup annotation warnings remain.
- `npm run db:check`: passes.
- `npm run test:db`: passes against the local database. Its aggregate fixture includes actual events, lifecycle metadata, durable conversation and operation IDs; it verifies restoration on a second connection, reactive updates and stale-write rejection.
- `npm run test:lifecycle:live`: an actual five-turn Nemotron run passes assertions for dates, lineage, original preservation, salary fulfillment, realization of the discussed child, retained actual salary and independent boat financing. This script operates on an isolated in-memory fixture, not the user's saved workspace.

The asserted live fixture uses a November 8, 2026 assessment date:

1. NYC move in January 2027: $2,800 rent, $4,500 moving costs and $350 extra monthly expenses. First reserve failure is September 2027 (month 10): approximately $13,244 liquid against $13,290 required.
2. $20,000 annual hypothetical raise and a three-month delay: a viable child, with the original unchanged.
3. Actual $40,000 annual raise: actual salary becomes $112,000. The original NYC version crosses to viable; the child's salary prerequisite is fulfilled.
4. The delayed version is explicitly identified as completed: only that child is realized, New York becomes reality, salary stays $112,000, and provisional costs are disclosed.
5. Independent $250,000 boat with $10,000 down, 12% APR, 120 months and $1,500 monthly running costs: approximately $199,869 modeled debt and negative $2,950 monthly cash flow at month 36. Its December 2026 reserve failure is calculated from the updated New York reality. No hypothetical raise or second moving expense is inherited.

Local evidence: `logs/lifecycle-smoke.json` contains turn commands and snapshots; `logs/nemotron.jsonl` retains raw provider requests/responses with turn IDs. Logs remain excluded from Git. The successful final sequence starts at `live-lifecycle-1794123993798-1`.

Earlier live probes exposed invented baseline IDs, irrelevant optional fields, duplicate rescheduling events, repeated raises, wrong plan references and incorrect month indices. Those probes were not counted as successful journeys. They motivated scoped tool schemas, deterministic constructors/date conversion, durable reference resolution, stricter validation and stronger smoke assertions. A successful fixture is evidence for this journey, not a guarantee of arbitrary natural-language interpretation.

## Explicit limits

- UI behavior was tested through jsdom; no visual browser or physical mobile QA was performed.
- Dates use monthly buckets, with no partial-month income/rent calculations or automatic opening-balance advancement.
- Dated bonus/card-payoff corrections are rejected; their existing immediate-update behavior remains supported and idempotent.
- A legacy move with no structured group/destination needs its events annotated before realization. Multiple cost lines with one combined actual override, or move costs preceding the selected rent activation, require explicit reconciliation rather than guessing.
- Historical projections for old manually archived plans are frozen at migration because earlier financial snapshots cannot be reconstructed. Existing user-created plans are preserved; the clean-baseline migration is not repeated.
- Loan payments below the amortizing minimum are rejected; negative amortization is not modeled.


## Model-owned branch origin correction

The model now explicitly distinguishes `create_alternative_from_reality` from `create_child_timeline` in `select_action`. A revision that raises income before postponing the first move uses the former: it edits a copy of the source plan, returns `branchOrigin: "current"`, and is saved with no financial parent. `revisionOfId` retains its relationship to the original goal. A continuation after the original move uses the latter and retains that timeline as its parent.

The automatic renderer-origin adjustment was removed. The renderer does not inspect financial events and relocate a model-chosen child. Existing saved plans are not rewritten. Tools are scoped to the model-selected action: an alternative exposes the revision preview; a continuation exposes scenario additions, rather than the move-rescheduling preview.

`npm run test:branch-intent:live` verifies the actual deployment on the user's exact Seattle follow-up, a paraphrase, and a contrasting job-after-move request. The successful sequence starts with `branch-intent-1794127201497-1`; evidence is in `logs/branch-intent-smoke.json` and the raw turn-correlated log. It checks origin selection, four-month rescheduling, salary semantics, original preservation and retention of the original move for the later-job case. The five-turn live lifecycle also passes with the revised separate-path semantics. This verifies those inputs; it is not a guarantee of every future model interpretation.


## Actual raise after hypothetical conversation

The user's three-turn Seattle run exposed two model errors: a preview omitted the hypothetical $15,000 raise, and a later actual $8,000 raise was classified as another plan revision with the prior move delay repeated. Intent selection now uses a separate focused prompt that identifies the current statement's actual/hypothetical meaning, requested changes, salary semantics and effective timing before scenario execution instructions are supplied. The current request is explicitly included as workspace data. No natural-language keyword router or renderer correction chooses the operation.

The model's structured intent must agree with its selected action and preview: an actual statement cannot finish as a hypothetical branch; a requested salary change cannot be omitted; an annual increase cannot be silently treated as a total salary. Current actual raises use a date-free current-change tool, while explicitly dated changes have a separate tool. Once a complete preview succeeds, the offered finishing phase prevents repeatedly recreating previews. A later hypothetical job can reference an original event plus a month offset, so the tool computes its date without shifting the original move.

`npm run test:reality-intent:live` verifies the exact three-turn sequence, the actual raise without history, a real-raise paraphrase after hypothetical history, and a hypothetical contrast. The passing run starts at `reality-intent-1794128322198`; evidence is `logs/reality-intent-smoke.json`. It leaves two plans, raises actual salary from $72,000 to $80,000, keeps the delayed move dates unchanged, and retains the $87,000 prerequisite as pending. It does not add $15,000 again to the actual income. The branch-origin and five-turn live checks also passed during this change. Earlier failed probes remain in raw logs and are not counted as successful runs.


## Discarding a plan conversationally

"Forget the boat" revealed that plan cancellation was missing from the model's action vocabulary. The model first tried a new purchase, then an actual update and finally an unrelated salary clarification. The protocol now provides `archive_plan` / `preview_archive_plan` and a distinct `plan_management` interpretation. A successful archive preview returns a narrow command for one exact plan ID; application preserves actual finances, other plans, event/history data and optimistic sync behavior. It clears the archived active goal, records an idempotent operation ID and keeps the archived projection for manual restoration. Realized plans cannot undo actual events through this command.

Actual-update previews also reject salary, rent, move, bonus or payoff changes absent from the model's declared current-request changes. There is no keyword router or automatic replay of historical instructions.

`npm run test:discard-intent:live` passes with the exact "forget the boat" wording, with Seattle selected while explicitly discarding the boat, and with "Scrap that fishing boat idea. I'm not considering it anymore." The fixture includes the earlier $8,000 salary discussion and the irrelevant salary clarification to reproduce the reported context. It asserts that only the boat is archived and the entire real profile is unchanged. The successful sequence starts at `discard-intent-1794128744007-1`; evidence is `logs/discard-intent-smoke.json`. Unit, protocol and composer/reload tests cover exact-once application and persistence. Current suite: 83 passing tests; production build passes.


## Grounded archive references after New chat

The Denver report was not a leaked chat session: logs show no previous history, selected universe or active goal. Nemo proposed Seattle's ID for the named Denver request, and the archive preview previously trusted that proposal. Archive targets now require `resolve_plan_reference` before `preview_archive_plan` is offered. A reference must be quoted from the current request, and lookup returns matching active plan names/destinations rather than accepting a guessed ID. Explicit full names take precedence over overlapping names; broad references matching multiple plans require clarification. Contextual pronouns require a real active goal and cannot override an explicitly named reference. Only a uniquely resolved ID can enter an archive preview. The archive phase has its own short prompt and no unrelated financial tools.

`npm run test:plan-reference:live` passes the exact three-name fixture: Seattle Move, Denver Move and Seattle → Denver Move. In a fresh chat, "forget about denver" asks which Denver plan without applying any command. Selecting Seattle does not change that result. Explicitly naming either full Denver plan archives only that plan. The successful run starts at `plan-reference-1794129981554-1`; evidence is `logs/plan-reference-smoke.json`. The existing three boat-discard live checks also pass. The full suite passes 87 tests, and the production build passes. Existing saved archives are not silently rewritten; a mistakenly archived plan can be restored through the timeline's existing archive controls.
