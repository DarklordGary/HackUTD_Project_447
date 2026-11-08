# Ping — Financial Multiverse

A React + Vite + TypeScript prototype for exploring alternate financial lives. It includes seeded finances, independent universes, conversational edits, branching, comparisons, life updates, notifications, and monthly financial projections.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The seeded financial workspace uses browser localStorage, while chat uses the configured Brev-hosted Nemotron deployment. There is no phrase-based inference fallback. No login, account linking, or personal financial input is needed.

## Try the story

1. From **Timelines**, choose **New universe** and ask **“Can I move to New York?”**, or type directly into the floating Ping composer.
2. Send **“What if I got a $90,000 job two months after moving?”**. Nemotron uses the current universe as context and chooses the appropriate operation; branches preserve their parents.
3. Choose **Compare with original**, then use the month slider to compare their net worth, savings, income, cash flow, and debt.
4. Open **My Baseline**, choose **Update reality** and send **“I got a new job paying $90,000.”**.
5. **Reality updates** shows the before/after baseline chart and the effect on every universe. The original New York move changes from “Worth exploring” to “On track.”

Existing seeded universes are available immediately on the branching **Main Reality** canvas. Select a line, timeline name, or life-event marker to open its projection chart and **Branch Summary**. Toggle Savings, Net Worth, Cash Flow, or Debt; use the month slider to inspect exact financial breakdowns. The summary includes events, assumptions, CSV export, and controls to edit, branch, compare, archive, or restore a timeline. The floating composer is available across pages. **My Baseline** groups actual income, liquid assets, recurring expenses, debts and investments into financial columns. Use **Settings → Reset demo** to restore the starting state.

The timeline-first layout follows the four supplied wireframes in `Downloads/hackutdui`: branching routes around Main Reality, sidebar navigation, financial baseline columns, a chart with an adjacent branch summary, and a floating AI composer. The engine, Nemotron tools and persistence remain shared through `src/usePing.ts`; canvas relationships are derived from persisted parent/event IDs rather than decorative sample paths.

## Nemotron on Brev

Chat uses the official `openai` Node SDK against an OpenAI-compatible Nemotron server. Requests are made by the Node middleware, never directly from the browser. Copy `.env.example` to `.env.local` and restart Vite if it is already running:

```dotenv
NEMOTRON_BASE_URL=https://5000-19yyxh1ah.gobrev.dev/v1
NEMOTRON_API_KEY=EMPTY
NEMOTRON_MODEL=nemotron
NEMOTRON_ENABLE_THINKING=false
```

The API key is the literal placeholder `EMPTY` for this public deployment. No OpenAI key or hosted NVIDIA API key is needed. `NVIDIA_*` settings from the previous provider are no longer used. Do not prefix private configuration with `VITE_`.

For a standalone prompt, run:

```sh
npm run nemotron:chat -- "Which is larger, 9.8 or 9.11?"
npm run nemotron:chat -- --no-thinking "Reply with a short greeting."
```

`askNemotron(prompt, enableThinking, tools?)` in `server/nemotron-client.ts` prints the provider's `reasoning_content` before its main `content`, and reports `message.tool_calls` when present. Its default enables thinking; `--no-thinking` disables it. The Node SDK equivalent of Python's `extra_body` is the additional top-level request property `chat_template_kwargs: { enable_thinking: false }`, not a nested `extra_body` field. See the [official SDK Chat Completions reference](https://developers.openai.com/api/reference/typescript/resources/chat/subresources/completions/methods/create).

Interactive chat defaults to thinking disabled for latency and token-budget control. Set `NEMOTRON_ENABLE_THINKING=true` to enable it for the application. An enabled-thinking branch probe exhausted the 4,096-token response budget; the same request completed with thinking disabled. Truncated output and provider/network errors are surfaced, with no silent fallback to another model or phrase rules. Raw provider reasoning is retained server-side for tool continuations and is not returned to the browser; the standalone helper prints it explicitly.

The bounded agent in `server/agent.ts` requires structured function calls for its application protocol; Nemotron chooses the action and tool arguments. It sends standard `{ type: "function", function: { name, description, parameters } }` definitions, inspects `message.tool_calls`, validates arguments with Zod, runs the tools, and returns each result as a `role: "tool"` message using its original call ID. It first offers `select_action`, letting Nemotron choose between an actual life update, a child or independent timeline, an edit, a question, or clarification. This tool returns the already-available profile and relevant timeline facts. Subsequent tools are scoped to that action: a preview must succeed before `apply_preview` is available, and the model cannot switch a hypothetical operation into a real update midway through a turn. Read-only tools remain available for calculations; clarification is available when selected initially or after repeated validation errors. It supports:

- Profile, timeline and monthly projection reads, plus comparisons.
- Scenario simulation with an explicit model-chosen `create`, `branch` or `modify` operation. New events are supplied separately from explicit existing-event replacements.
- Reality-update previews for actual life changes.
- Applying a specific calculated preview, answering without mutation, or asking a clarifying question.

Nemotron determines intent from the conversation. A selected universe supplies context; legacy client mode hints do not restrict the model or choose the applied action. The returned operation controls the client's state update. Parents and unrelated events are preserved; adding a later move does not replace the earlier move. The financial engine still handles all calculations and validates event data. These are calculation/data constraints, not natural-language classification rules.

Only a successful final preview is applied through the existing persistence path. Stale workspace results are rejected. Tool errors are returned to the model for correction, with eight rounds, 24 tool calls, and a 90-second total deadline. The client displays real loading while the request is pending. A static-only deployment does not include the API middleware: run a Node/Vite preview server or port the middleware to your backend.

Live checks against the supplied Brev deployment verified simple chat, reasoning enabled/disabled, profile-reading tools, a salary life update, and a Chicago child branch. Tests also mock SDK requests, reasoning extraction/print ordering, tool-call continuation, invalid tools, and model-selected actions that differ from legacy interface modes.

Every Nemotron HTTP response is appended to `logs/nemotron.jsonl` before SDK parsing or tool validation, including errors, malformed output and truncated completions. Each entry stores timestamps, a unique ID, provider request ID, HTTP status, the full request body (conversation, selected timeline context and prior tool results), and raw response body (including reasoning, tool calls and usage). This covers both the app and `npm run nemotron:chat`. Set server-side `NEMOTRON_LOG_PATH` to change the file location. Logs are excluded from Git; authorization headers are never recorded. A write failure stops the request with an error rather than applying an unsaved response. Existing responses from before logging was added cannot be recovered from this file.

A standalone destination alternative defaults to an independent timeline from baseline finances. Continuing an existing move requires that intent in the current message or conversation; selecting New York alone does not request inheriting its events.

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
