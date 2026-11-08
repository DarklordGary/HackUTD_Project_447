# Ping: hackathon presentation readiness

Reviewed November 8, 2026, after the individual timeline results implementation. This is a working checklist for getting the current project ready to present, not a claim that every item is finished. Owners below are suggested roles; assign actual team members before rehearsal. Timing assumes a three-minute presentation until the team confirms the event's limit and submission rules.

## Readiness decision

**The core product is implemented, but the unrestricted live conversation is not yet reliable enough to be the only presentation path.** Offline tests, build and live database integration pass. Fresh live AI checks reproduced two interpretation errors that materially change financial outcomes. Resolve them or use an explicitly worded, rehearsed path with a recorded backup. Do not claim the historical five-turn live check currently passes unchanged.

The strongest story is: **“Explore financial futures, compare their consequences, and keep those futures aligned when real life changes.”** Show the map, one quantified decision, and the effect of a real change. Avoid filling the pitch with every supported event type.

## What is already available

| Area | Current implementation | Presentation implication |
| --- | --- | --- |
| Starting experience | Alex Morgan's fictional Austin profile; $72,000 annual salary; no hypothetical timelines on reset | Explain the seeded profile immediately; no login or bank connection to demonstrate |
| Timeline map | Independent futures, child paths, revision relationships, event inspection, branch visibility filters | Visually establishes the product; inspect generated relationships rather than assuming every revision is a child |
| Individual results | Fixed 36-month net worth/savings, signed Main Reality differences, monthly chart/breakdown, minimum liquid funds and jump, grouped events, assumptions | Lead with outcomes and the hardest month; switching months does not change the horizon |
| Comparison | Main Reality plus selected paths; Savings, Net Worth, Cash Flow and Debt; historical date disclosure | Show one metric and two alternatives; extra lines dilute the story |
| Conversation | Nemotron selects actions and tools; deterministic previews precede application; errors/loading/history/New chat | Real AI dependency; no offline phrase-based generation fallback |
| Reality lifecycle | Dated actual changes, salary prerequisite reconciliation, move realization, preserved historical projections, conversational plan archive | Distinguishes Ping from a one-off calculator; verify exact target and actual salary during rehearsal |
| Persistence | Browser localStorage; optional anonymous SpacetimeDB aggregate with subscriptions and optimistic revisions | Reload continuity is useful; another browser/device does not automatically share identity |
| Export | Selected projection CSV | Exports monthly figures, not a full restorable workspace backup |
| Platform | React/TypeScript/Vite UI; Node middleware; Zod contracts; TypeScript SpacetimeDB module | Static `dist/` hosting alone cannot serve AI requests |

Direct branch/edit/reality/archive/restore shortcuts were removed from the latest detail UI. Request mutations through Ask Ping. The compare and CSV controls remain. Do not rehearse from older screenshots or older “More actions” instructions. No restore action is exposed in the current agent tool list; avoid promising archived-plan restoration during the demo.

## Fresh verification and its limits

Checks below were run against the current working tree, based on commit `ba3c0db` plus the existing uncommitted timeline changes. No application fixes were made for this review.

| Check | Result in this review | Meaning |
| --- | --- | --- |
| `npm test` | PASS: 106 tests, 11 files | Engine, tool protocol, results interactions, lifecycle and migration regression coverage |
| `npm run build` | PASS | TypeScript and client bundle compile; upstream Zod/Rollup annotation warnings remain |
| `npm run db:check` | PASS | SpacetimeDB module type checks |
| `npm run test:db` | PASS against local database | Persistence, second connection restore, reactive updates and stale-write rejection |
| `npm run test:lifecycle:live` | FAIL at turn 1 | “$350 extra” was sent to the absolute destination-budget tool as $350 total; assertion expected a different outcome |
| Explicit total-budget live probe | PASS for one move | $1,510 total destination living budget became the intended month-2 replacement event; about 3.6 seconds for this request |
| Five-turn probe changing only the budget wording | FAIL at turn 3 | “raise of $40,000” became an absolute $40,000 salary instead of $112,000 |
| Probe with explicit total budget and actual total salary | First three turns PASS; stopped on turn 4 clarification | Two alternatives were created and actual salary became $112,000 with assertions passing; realization then asked which New York location rather than completing the requested transition |

The live fixtures use isolated in-memory fictional workspaces; they do not edit the browser's saved presentation workspace. Raw provider evidence is in ignored `logs/nemotron.jsonl`. The original failed run is `live-lifecycle-1794141076902-1`; the salary failure is `presentation-audit-lifecycle-1794141141015-3`. `logs/lifecycle-smoke.json` and `logs/presentation-audit-lifecycle.json` contain their assertions/failure records. These files are local evidence, not submission assets, and may be overwritten by later checks.

The explicit three-turn core is recorded in `logs/presentation-audit-explicit.json`, starting at `presentation-audit-explicit-1794141177537-1`. Turn 4, `presentation-audit-explicit-1794141187952-4`, asked “Which specific location within New York should be used for the move (e.g., Manhattan, Brooklyn, etc.)?” This is a separate realization/reference-resolution gap, not a provider outage. All five turns have **not** passed in a fresh run here; turn 5 was not reached. Temporary audit scripts under ignored `logs/` changed prompt wording only; the checked-in verification script and application code remain unchanged.

Prior-thread browser QA reports desktop 1280px and 768/390/320px layouts, keyboard month selection and a simulated keyboard viewport. **This audit did not run fresh browser or projector QA.** Physical phone touch/keyboard, screen-reader output, actual projector readability, deployed HTTP route behavior, reload after live AI mutations, provider failure in the UI, and the final presentation machine still need rehearsal. Direct agent probes do not test the complete browser-to-middleware path.

## Priority work list

P0 means fix or explicitly mitigate before presenting. P1 improves reliability and credibility. P2 can wait. Effort is an initial planning estimate, not a guarantee.

| ID | Priority / owner / effort | Work and evidence | Done when |
| --- | --- | --- | --- |
| R1 | P0 · AI/backend · 1–3 h | Preserve additive versus absolute living costs. The live model supplied `monthlyLivingExpenses:350` for “$350 extra.” Existing $380 recurring + $780 variable spending should not silently disappear. Inspect `preview_move_scenario`, action semantics and validation in `server/agent.ts`. | Additive and total-budget requests produce equivalent intended costs or ask a focused clarification; regressions assert events and dollar figures, not just internal viability; unchanged live lifecycle passes |
| R2 | P0 · AI/backend · 1–3 h | Preserve raise versus total salary. Raw live calls selected `salaryMeaning:annual_total` and `preview_salary_change(mode:absolute,value:40000)` for “raise of $40,000.” Structured stages agreeing with each other did not establish agreement with the request. | $72k + $40k becomes $112k; absolute $40k remains $40k; percent raises, selected hypothetical context and prerequisite fulfillment pass offline and live checks |
| R3 | P0 · demo operator · 30–60 min | Freeze exact prompts, dates, app state and machine. Keep an explicitly worded script as mitigation; repeat the full browser path. | Two consecutive clean rehearsals on the final machine; no unexplained totals or relationships; timings fit the slot |
| R4 | P0 · infra/demo operator · 30–60 min | Confirm Brev inference is awake and tool calling works; run Node middleware, not static assets alone. `/api/status` only returns a label and is not a provider health check. | One real scenario succeeds through the final app URL immediately before presenting; runtime restart steps are documented for a teammate |
| R5 | P0 · presenter/design · 45–90 min | Produce a short screen recording, screenshots, deck and exact fallback narration. These assets are not yet delivered by this audit. | Recording opens locally with networking off, fits the slot, and honestly identifies any prerecorded segment; screenshots legible on projector |
| R6 | P0 · team lead · 20–30 min | Confirm actual pitch/demo/Q&A time, required submission fields, deadline/time zone, sponsor categories, judging criteria and permitted video use from team/event materials. No current official rules were supplied. | Final checklist names the required URLs/files, owner and confirmed deadline; submission completed and verified |
| R7 | P1 · frontend · 15–45 min | `src/state.ts:readState` gates loading on truthiness of `profile.annualSalary`; a valid $0 salary falls back to seed on a local-only reload. Code finding, not browser-reproduced here. | A zero-income workspace survives reload and schema validation; meaningful persistence regression covers the case |
| R8 | P1 · frontend/copy · 15–30 min | Settings still labels a row “Viability rule”; README retains a viability definition and older test-count/live-pass language. Latest product direction removed user verdicts. | Rename the row to a reserve comparison benchmark; current documentation separates fresh checks from historical results; no user-facing scoring claim |
| R9 | P1 · frontend/presenter · 30–60 min | Applied move response can enumerate nearly every negative cash-flow month, producing a long transcript. The successful explicit-budget probe did this. | Main response leads with horizon, first shortfall and minimum balance; detailed months remain available; presenter can find the result without scrolling through a wall of text |
| R10 | P1 · QA/design · 30–60 min | Check the final desktop resolution, 125–150% zoom, keyboard navigation, phone composer and long names/event groups. Test reset, New chat, compare, export and archived inspection. | Demo-critical controls remain visible; no popup/composer overlap; focused month and breakdown agree; record actual device/browser |
| R11 | P1 · infra/team lead · 30–60 min | Save final source and restoration material. Existing UI CSV cannot restore full state; local and cloud state can differ. | Review existing working-tree changes, commit/tag a known-good version, retain lockfile, and save a fictional full-workspace backup using a documented method; prove restoration in an isolated browser |
| R12 | P1 · presenter · 20–40 min | Align claim boundaries and technology attribution. Do not guess the hosted model's exact variant from alias `nemotron`. | Verify actual deployment model on Brev if naming it; describe deterministic math, estimates, identity and privacy accurately; every number shown matches the frozen scenario |
| R13 | P2 · backend/infra · after demo | Public-host hardening: public database reads, anonymous identity, API authentication/rate limits, input completeness, log retention and service health. | Plan server-enforced read isolation and deployment controls before using real financial data; not required for a local fictional demo |
| R14 | P2 · product · after demo | Inline event edits/undo, sensitivity controls, detailed cost summaries, real account ingestion, live destination cost lookup | Keep outside the critical demo path; these are not current capabilities |
| R15 | P1; P0 if realization is presented live · AI/backend · 1–2 h | Explicitly worded five-turn probe stalled on an unnecessary neighborhood clarification when completing the discussed delayed NYC plan. Inspect realization action selection and matching against established plan facts. | Already-established destination/budget can be reused provisionally; only genuine ambiguity asks a question; complete the full five-turn live sequence if it is included in the presentation |

### Why R1 changes the story

A deterministic check using the seeded profile, January 2027 move, $2,800 rent and $4,500 one-time cost gives:

- With **$350 total** replacement living costs: month-36 savings **$36,817.15**, net worth **$79,403.40**, minimum liquid funds **$19,881.96**.
- With **$1,510 total** replacement living costs ($1,160 existing + $350 extra): month-36 savings **$0**, net worth **$36,806.87**, minimum liquid funds **−$1,529.38**.

This is an intent error, not a rounding issue. The deterministic engine computes the events it receives correctly; the model supplied materially different events. Fix the semantics rather than weakening the failing assertion. The specialized destination tool intentionally expects an absolute budget, so the request and tools must reconcile the two meanings explicitly.

## Recommended presentation flow

Use a three-turn live core. Make realization and financing optional extensions or recording material; five AI turns increase timing and interpretation exposure. Prompts below deliberately state absolute amounts. They remain a mitigation until the full browser sequence is rehearsed, not proof that general language routing is fixed.

| Time | Screen/action | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | Opening slide | “A budget shows where you are. A major life decision needs a way to compare the futures you could choose.” |
| 0:20–0:35 | Main Reality and seeded Alex profile | “Ping starts with a fictional financial profile. We can explore a change without overwriting real life.” |
| 0:35–1:10 | Create NYC scenario; inspect results | “This future has an explicit moving cost and living budget. We can see the three-year result and the month cash gets tight.” |
| 1:10–1:40 | Revise salary/timing; compare paths | “What if the move happens later, after a raise? Ping preserves the original so we can compare.” |
| 1:40–2:10 | Record actual total salary; revisit comparisons | “When real life changes, existing futures recalculate. An assumed raise is reconciled rather than added twice.” |
| 2:10–2:40 | One architecture slide | “Nemotron interprets intent and calls validated tools. One deterministic engine computes the dollars; SpacetimeDB persists the workspace when configured.” |
| 2:40–3:00 | Close | “Ping makes the consequences visible while leaving the choice with the user. Next we would add trusted financial inputs and better scenario controls.” |

Live script, from Reset demo:

1. **Move:** “Can I move to New York in January 2027? Use $2,800 monthly rent, $4,500 one-time moving cost, and a TOTAL destination living budget of $1,510 per month excluding rent. This replaces my current recurring and variable spending; it is not an additional expense.”
2. **Alternative:** “What if I got a raise of $20,000 annually and waited 3 months before moving? Preserve the original and create a connected alternative.” Check that January becomes April 2027, the original is unchanged, and target salary is $92,000. This revision can originate from Main Reality with `revisionOfId`; it need not have `parentId` or visually fork from the original path.
3. **Actual change:** “My actual TOTAL annual salary is now $112,000, replacing the previous $72,000 salary. Record this real change effective now.” Check actual salary, both forecasts, and fulfillment of the $92k prerequisite. Do not narrate success before checking these facts.

Optional extensions if time allows:

- Realization: “I've moved to New York now. The delayed New York version is the one that happened. Use its established move estimates provisionally, keeping my actual salary.” Verify exactly that plan is realized, actual salary stays $112k, and move costs are not replayed. Actual completion is now, not the future hypothetical move date; explain this deliberate transition if asked.
- Financing: independent $250k boat, $10k down, 12% APR, 120 months, $1,500 monthly running costs. Show modeled liability and down payment only; the purchased asset's value is excluded from net worth. This is a technical extension, not the strongest short-pitch story.
- Archiving: name the exact plan when asking Ping to set it aside. Avoid ambiguous city names shared by two versions.

The seed's reference baseline is month 0 November 2026 through month 36 November 2029. Baseline month-36 net worth is **$98,720.87**, savings **$56,134.62**; UI rounds dollar displays. The explicit NYC scenario above gives **$36,806.87** net worth, **$0** savings and a **−$61,914.00** net-worth difference at month 36. Its minimum liquid funds occur at month 36. A reserve benchmark shortfall starts September 2027, month 10: approximately **$13,244** liquid against **$13,290** of modeled expenses. These are fixed-fixture calculations, not real New York price claims.

## Deck and delivery assets to prepare

1. Problem and user: a person considering relocation, a job change or a major purchase; one concrete uncertainty.
2. Product: map screenshot plus “Branch a future → compare consequences → update reality.”
3. Demonstration: app or short local recording; keep the exact prompts accessible to the operator for copy/paste.
4. How it works: React UI → Node agent/Nemotron tool calls → validated deterministic engine → preview/application → local persistence and optional SpacetimeDB sync. Explain the boundary between inference and arithmetic in one sentence.
5. What the team built and next steps: cite only verified behavior; acknowledge scenario estimates and prototype financial scope.

Prepare a local deck/PDF, 45–90 second recording with an immediate starting frame, 3–5 screenshots covering before/alternative/actual update, a prompt sheet, repository/demo links, a short submission description, team/contribution credits, technology/sponsor attribution after confirming requirements, and any required video/thumbnail. None of these submission assets are created by this checklist. Do not put raw provider logs or private environment values in public materials.

Suggested handoffs: presenter owns story and time; operator owns prompts and app state; technical speaker owns architecture/Q&A; one teammate owns timer and switches to the backup on cue. One person can hold multiple roles.

## Startup and recovery runbook

Use the final machine and browser profile throughout rehearsal. Node in this audit is v24.11.1; npm is 11.6.2. The project requires Node 22.12+.

1. Install dependencies with `npm ci` when preparing a clean checkout. Preserve `.env.local`; do not overwrite working configuration with the example. Server-only `NEMOTRON_*` values must stay server-side. Check the configured model/deployment and that `logs/` is writable; logging failure stops application requests.
2. If demonstrating SpacetimeDB, run `npm run db:start` in a dedicated terminal only if it is not already running on port 3000. On a new machine publish with `npm run db:publish`. Existing data should not need republishing for the UI-only timeline change. Match `VITE_SPACETIMEDB_DATABASE` to the published name (`ping-local` for the helper).
3. Run `npm run dev` and open `http://127.0.0.1:5173`. If using the built app, run `npm run build` followed by `npm run preview`; this repository wires the Node middleware into both Vite dev and preview. Keep that process alive. Do not use a generic static file server for the live conversation.
4. For a deliberate device-only demo, unset the database name and restart dev; for a preview build, rebuild after changing `VITE_*` values. Local-only mode removes database dependency; it does **not** remove the Nemotron network dependency.
5. In Settings inspect storage status. Test a real AI turn in a disposable fictional workspace. A successful `/api/status` or the “Nemotron” label alone does not prove inference works. Check the provider, writable logs and final app route.
6. Use **Reset demo / Start over**, confirm, and verify Main Reality has no hypothetical branches. **New chat only clears conversation/focus; it keeps finances and plans.** Keep only the operator's browser tab active on that identity to avoid conflicting writes.
7. Rehearse the exact prompts. Check each event amount/date and result before capturing screenshots. Reload once after a completed turn, verify state/conversation, then return to the agreed opening state.
8. Record and save the successful sequence, close distracting tabs, enable Do Not Disturb, connect power, test projector resolution/zoom, and keep local slides/recording open. Use cached or local fonts if the Google Fonts dependency affects the disconnected backup layout.

Recovery cues:

| Failure | Operator action | Presenter line |
| --- | --- | --- |
| Inference takes more than the rehearsed wait budget (target 10–15 s for the stage) | Switch to recording; server may continue up to 90 s and client up to 100 s | “Here is the same flow from our recorded run.” |
| Unexpected amount, date, city or plan | Stop that turn; do not explain incorrect figures as correct; switch to captured evidence | “The interpretation needs correction; this is the verified scenario we intended.” |
| Database disconnect | Continue only if device save is confirmed; avoid switching identities mid-demo | “The workspace is saved on this device; live sync is currently unavailable.” |
| AI endpoint unavailable | Show existing projections/compare or recording | “Calculations on saved timelines still work; new language requests need the model service.” |
| App/server stops | Restart the known command; use deck/recording while recovering | Continue the product explanation from the backup |
| Wrong starting state | Reset only before presenting; otherwise use prepared backup | Avoid destructive recovery during the story |

Do not refresh repeatedly or resubmit while a request is pending. If abandoning an in-flight request in the UI, New chat invalidates its client application through the workspace generation guard; it does not guarantee server-side cancellation. Stay on the recorded path for the rest of that segment.

## Honest technical answers

- **What does the AI do?** Selects intent, tools and scenario parameters. Zod and tool phases validate data; the engine calculates projections and mutation summaries. These guards do not currently prevent all wrong interpretations, as the live failures show.
- **Why is it useful?** Alternatives retain history and can be compared against the same baseline; actual changes reconcile assumptions across futures. Describe this implemented behavior without claiming market uniqueness or measured user impact.
- **Where do prices come from?** Explicit user values or disclosed model scenario estimates, not live rent/cost/exchange-rate research.
- **Is this personalized financial advice?** It is a fictional-data prototype showing modeled consequences. Taxes use a fixed effective rate; returns are assumptions, not predictions. There is no bank-linking or real document-upload flow to demonstrate.
- **What does net worth include?** Checking + savings + investments − modeled debt. Purchased asset value/depreciation and home appreciation/mortgage ownership are excluded. Cash purchases do not create loan debt; liquidity deficits can remain negative.
- **What does the three-month threshold mean?** A disclosed reserve comparison benchmark, not a verdict, certification, credit score or instruction to take a path. Show actual figures and dates.
- **How does saving work?** Local storage always attempts to persist; configured SpacetimeDB saves a versioned aggregate and streams updates to connections sharing the anonymous token. Fresh browser identity means a separate workspace. Public-table privacy is not production-ready for real financial data.
- **How reliable is it?** Quote the fresh passing tests/build/database check alongside the failed live interpretations. Tests establish specific behaviors; they do not prove arbitrary conversation correctness. No unmeasured accuracy, latency distribution or user adoption claims.

## Final sign-off

Assign initials and completion times. A recording-only mitigation is acceptable if the presenter clearly identifies it; it does not close R1/R2 as engineering fixes.

- [ ] Confirm event timing, rubric, sponsor requirements and submission deadline (R6).
- [ ] Resolve R1/R2 or approve an explicit scripted/recorded mitigation and accurate capability claims.
- [ ] Re-run unit/build/database checks after any fixes; repeat live semantic regressions and the exact browser demo.
- [ ] Complete two clean timed rehearsals on the final display; capture actual per-turn waits.
- [ ] Confirm baseline, all prompt values, month selection, comparison lineage, actual salary and reality realization if included.
- [ ] Verify reset versus New chat, reload persistence, device-save fallback and API failure behavior.
- [ ] Freeze final source/state; preserve environment configuration privately and validate recovery on a teammate's machine or isolated profile.
- [ ] Create/open local deck, recording and screenshots; verify disconnected playback and projector legibility.
- [ ] Recheck provider readiness shortly before the slot; keep power and reliable network available.
- [ ] Submit and open every required link/file from a separate session; confirm permissions without exposing demo secrets/logs.

## Repository map for follow-up work

| Files | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components.tsx`, `src/TimelineCanvas.tsx`, `src/TimelineResults.tsx`, CSS | Navigation, map/chart/detail, composer and responsive UI |
| `src/usePing.ts`, `src/state.ts`, `src/workspace-upgrade.ts` | Requests, local state, idempotency/stale guards, lifecycle, reset and migrations |
| `src/engine.ts`, `src/results.ts` | Sole financial calculation engine and result observations/date/source helpers |
| `src/types.ts`, `src/contracts.ts`, `src/seed.ts` | Data types, Zod schemas and fictional opening profile |
| `server/agent.ts`, `server/nemotron.ts`, `src/interpreter.ts` | Model tools/phases, HTTP middleware and browser API requests |
| `server/nemotron-client.ts`, `server/nemotron-log.ts` | Provider SDK config, timeouts, raw response logging |
| `src/sync.ts`, `src/sync-live.ts`, `spacetimedb/src/index.ts`, generated bindings | Optional database transport, optimistic revisions and aggregate persistence |
| `scripts/verify-*.ts`, unit/UI test files | Live probes and offline regression evidence |
| `vite.config.ts`, `package.json`, `.env.example`, `index.html` | Runtime/build commands, middleware integration, configuration and external fonts |
| `docs/timeline-results-plan.md`, `docs/conversational-timeline-implementation.md`, `docs/ui-design.md`, README | Implemented scope and historical verification; reconcile older claims before submission |

Review scope included these areas, test/scripts and existing docs. Generated bindings and third-party dependencies were treated as integration surfaces, not manually audited line by line. No dependency-security audit, current event-rule research, public deployment test or new slide/recording production was performed.
