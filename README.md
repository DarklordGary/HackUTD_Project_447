# Ping — Financial Multiverse

A React + Vite + TypeScript prototype for exploring alternate financial lives. It includes seeded finances, independent universes, conversational edits, branching, comparisons, life updates, notifications, and monthly financial projections.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. With no environment configuration, the complete demo uses a clearly labeled deterministic scenario interpreter and browser localStorage. No login, account linking, or personal financial input is needed.

## Try the story

1. From **Timelines**, choose **New universe** and ask **“Can I move to New York?”**, or type directly into the floating Ping composer.
2. Send **“What if I got a $90,000 job two months after moving?”**. After creation, the chat defaults to branching the current universe; the original stays intact.
3. Choose **Compare with original**, then use the month slider to compare their net worth, savings, income, cash flow, and debt.
4. Open **My Baseline**, choose **Update reality** and send **“I got a new job paying $90,000.”**.
5. **Reality updates** shows the before/after baseline chart and the effect on every universe. The original New York move changes from “Worth exploring” to “On track.”

Existing seeded universes are available immediately on the branching **Main Reality** canvas. Select a line, timeline name, or life-event marker to open its projection chart and **Branch Summary**. Toggle Savings, Net Worth, Cash Flow, or Debt; use the month slider to inspect exact financial breakdowns. The summary includes events, assumptions, CSV export, and controls to edit, branch, compare, archive, or restore a timeline. The floating composer is available across pages. **My Baseline** groups actual income, liquid assets, recurring expenses, debts and investments into financial columns. Use **Settings → Reset demo** to restore the starting state.

The timeline-first layout follows the four supplied wireframes in `Downloads/hackutdui`: branching routes around Main Reality, sidebar navigation, financial baseline columns, a chart with an adjacent branch summary, and a floating AI composer. The engine, Nemotron tools and persistence remain shared through `src/usePing.ts`; canvas relationships are derived from persisted parent/event IDs rather than decorative sample paths.

## Nemotron

Copy `.env.example` to `.env.local`, set `NVIDIA_API_KEY`, then restart Vite. The API key stays on the Node server and is never included in the client build. The default model is `nvidia/nemotron-3.5-bolt-e4b`. `NVIDIA_MODEL` and `NVIDIA_API_URL` are configurable for another compatible Nemotron deployment. HTTP 401/403 is reported as an authorization failure; HTTP 410 indicates an unavailable model. Neither silently falls back to demo interpretation.

The Node middleware in `server/nemotron.ts` handles `/api/interpret` in development and `npm run preview`. Live requests go through the bounded function-calling agent in `server/agent.ts`. The model receives native NVIDIA-compatible `tools` definitions and chooses calls; the server validates their arguments, executes the tool, and sends a `role: tool` result back before the model chooses its next action. Live interpretation never passes through the demo's phrase rules.

Available tools:

| Tool                             | Purpose                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `get_financial_profile`          | Read actual finances and baseline assumptions.                                |
| `list_timelines`, `get_timeline` | Find relevant universes and inspect exact event IDs and schedules.            |
| `get_monthly_projection`         | Get any month's engine-calculated financial breakdown.                        |
| `simulate_scenario`              | Preview additions, replacements, removals and their calculated outcomes.      |
| `compare_timelines`              | Inspect side-by-side calculated results.                                      |
| `preview_reality_update`         | Recalculate actual changes across every universe without persisting yet.      |
| `apply_preview`                  | Return a specific validated preview for the application to apply and persist. |
| `answer_question`                | Answer conversationally without creating or modifying a universe.             |
| `ask_clarification`              | Ask about ambiguity without changing finances.                                |

For example: read the NYC timeline → schedule an annual $90,000 salary two months after its move event → simulate → inspect the actual forecast → return the chosen preview and an explanation. The model can explore multiple previews before choosing one. Context includes the full existing financial profile, available timelines, selected universe and the last 20 conversational messages.

Every tool has a strict Zod argument schema. Edits use `replaceEventId` and `removeEventIds`, independent of wording; unrelated events and assumptions are retained. The tools cannot write arbitrary balances, run code or access external systems. Reality tools are rejected outside reality mode. Intermediate previews are isolated snapshots, and only a successful final preview is applied through the app's existing state/persistence path. The UI rejects stale results if finances changed during reasoning. Chat exposes a collapsible list of tools used. Tool errors are returned to the model for correction, with an eight-round / 24-call / 90-second limit. Provider errors do not silently switch to demo mode. Calculated data always comes from the TypeScript engine; the model's natural-language explanation is generated from those results and still needs normal LLM accuracy review.

Without an API key, an explicitly labeled demo interpreter supports NYC moves, salary changes, rent changes, car purchases, debt payments, bonuses, tuition, and spending reductions. It resolves a new job relative to a move, and can reuse an existing salary for “the job immediately.” Unsupported requests ask for clarification.

Live hosted integration was verified with Nemotron 3.5 Bolt E4B: the models endpoint and chat completions returned HTTP 200, a checking-balance question used `get_financial_profile → answer_question`, and a salary branch used `get_timeline → simulate_scenario → apply_preview` with the new job correctly scheduled two months after the existing move. A simulated change must finish with `apply_preview` or clarification; it cannot silently end as a read-only answer. Automated tests cover the protocol, recovery paths, mode restrictions and calculations using mocked model responses. Your own deployment still needs a valid key with hosted-inference access. A static-only deployment does not include the API middleware; deploy with a Node/Vite preview server or port the middleware to your backend. See NVIDIA's [function-calling documentation](https://docs.nvidia.com/nim/large-language-models/1.15.0/function-calling.html).

## SpacetimeDB

The TypeScript module is in `spacetimedb/src/index.ts`; generated, typed SDK bindings are checked in at `src/module_bindings`. The module persists each seeded workspace as an atomic aggregate with an optimistic revision counter. SDK subscriptions deliver reactive changes across connections sharing the same anonymous identity. The SDK token is retained locally; there is no authentication UI.

Install the [official SpacetimeDB CLI](https://spacetimedb.com/install). A project-local CLI under `.spacetime/bin` is also recognized. In separate terminals:

```sh
npm run db:start
npm run db:publish
```

Set these values in `.env.local`, then restart Vite:

```dotenv
VITE_SPACETIMEDB_URI=ws://127.0.0.1:3000
VITE_SPACETIMEDB_DATABASE=ping-local
```

On this prepared workspace the local module has already been published and `.env.local` points to it. If the database is unavailable, the UI reports the connection status and continues storing changes on the device. A fresh browser identity starts its own seeded workspace. The module's public table and client-side row filter are appropriate for this fictional demo; production financial data would require server-enforced read isolation, not merely a filtered subscription.

After changing the database schema, run `npm run db:generate` and republish. Data files and binaries under `.spacetime/` are ignored by Git.

## Financial model

`src/engine.ts` is the sole calculation engine. It processes month-indexed events in order, applies after-tax salary and recurring expenses, amortizes debts with monthly interest, applies investment growth and contributions, and transfers cash flow to/from savings while maintaining a checking buffer. When liquid funds run out, negative checking remains visible rather than concealing insolvency. Paying off a credit card consumes actual liquid funds and does not invent net worth.

- Starting date: November 2026; 36-month horizon.
- Alex earns $72,000 gross annually; estimated effective tax rate is 24%.
- Checking: $4,250; savings: $18,750; investments: $21,400.
- Rent: $1,600; recurring bills: $380; variable spending: $780; obligations: $120 monthly.
- Credit card: $2,400 at 19.9% APR, $180 monthly payment.
- Student loan: $11,600 at 4.5% APR, $220 monthly payment.
- Investments: $450 monthly contribution, 6% assumed annual effective return.
- Savings: 3.5% assumed APR. Inflation and automatic salary growth are not modeled.
- Viability means liquid funds remain above three months of current living expenses and the final six months have nonnegative cash flow. It is a disclosed prototype heuristic.
- The home universe tracks down-payment savings only; it does not model ownership, mortgage payments, or appreciation. Car purchases assume cash and omit resale value.

Reality updates store before/after snapshots, recalculate every universe, and preserve hypothetical events. Any salary/rent overlap is flagged. Users can retain those events, change them conversationally, or remove them in universe detail.

## Check

```sh
npm test
npm run build
npm run db:check
# With the local database running and published:
npm run test:db
```

Tests cover cent-level calculations, deterministic behavior, scheduled events, debt payoff, insolvency, relative event references, branch independence, reality-update accounting, and the complete demo journey. The database check verifies persistence, restore on a second connection, reactive updates, and stale-write rejection against a real local SpacetimeDB instance.

Production build and HTTP API checks passed. Visual browser QA was blocked by unavailable browser access and denied native Chrome access in this session.

## References

- [SpacetimeDB TypeScript client](https://spacetimedb.com/docs/clients/typescript/)
- [SpacetimeDB reducers](https://spacetimedb.com/docs/functions/reducers/)
- [NVIDIA Nemotron 3.5 Bolt E4B](https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b)
