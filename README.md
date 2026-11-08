# Ping — Financial Multiverse

A React + Vite + TypeScript prototype for exploring alternate financial lives. It includes a financial profile, independent universes, conversational edits, branching, comparisons, life updates, notifications, and monthly financial projections.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The financial workspace saves locally and syncs to the configured SpacetimeDB database. SpacetimeAuth enables account sign-in when configured below; guest mode remains available. Chat uses the configured Brev-hosted Nemotron deployment.

## Try the story

Main Reality starts with zero hypothetical branches. Use the always-visible Ping composer:

1. **“Can I move to New York?”** creates an independent possibility with disclosed moving costs, destination rent and a full destination living budget in USD. From the move month, that budget replaces uploaded recurring and variable spending; ongoing obligations, debt payments and contributions remain. Country-only requests disclose an assumed city/lifestyle or ask for one. Missing costs are scenario estimates, not live price lookups.
2. **“What if I got a raise of $20,000 annually and waited 3 months before moving?”** creates a connected alternative, preserving the original and rescheduling the entire move group.
3. **“I got a raise of $40,000 annually.”** updates actual income and recalculates active plans. Satisfied salary prerequisites are fulfilled, rather than added again.
4. **“I've moved to New York. The delayed version is the one that happened. Use its estimates provisionally.”** records the move in Main Reality and realizes only that plan. Other versions retain their history and no longer replay the completed move.
5. **“What if I bought a $250,000 boat with $10,000 down, financed at 12% APR for 120 months and $1,500 monthly running costs?”** starts an independent future from actual New York finances. Purchased asset value and depreciation are excluded.

Outcomes depend on the supplied amounts, dates and disclosed estimates. Results show amounts, dates and signed dollar comparisons without categorical timeline verdicts. Cash purchases never create modeled loan debt. See [lifecycle implementation and verification](docs/conversational-timeline-implementation.md) for the fixed-date fixture and limitations.

The map remains the primary view. Select a path or event to inspect its projections and Branch Summary. Savings, Net Worth, Cash Flow and Debt share the deterministic engine. The composer and durable active goal retain conversation context across navigation and reload. Manually archived and realized plans retain historical projections; realized plans cannot be restored as pending moves. Settings → Reset workspace restores Main Reality with no hypothetical branches.

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

Only a successful final preview is applied through the existing persistence path. Applied-preview explanations are generated from deterministic results; raw model-written financial summaries are not used as application feedback. Stale workspace results are rejected. Tool errors are returned to the model for correction, with eight rounds, 24 tool calls, and a 90-second total deadline. The client displays real loading while the request is pending. A static-only deployment does not include the API middleware: run a Node/Vite preview server or port the middleware to your backend.

Live checks against the supplied Brev deployment verified simple chat, reasoning enabled/disabled, profile-reading tools, a salary life update, and a Chicago child branch. Tests also mock SDK requests, reasoning extraction/print ordering, tool-call continuation, invalid tools, and model-selected actions that differ from legacy interface modes.

Every Nemotron HTTP response is appended to `logs/nemotron.jsonl` before SDK parsing or tool validation, including errors, malformed output and truncated completions. Each entry stores timestamps, a unique ID, provider request ID, HTTP status, the full request body (conversation, selected timeline context and prior tool results), and raw response body (including reasoning, tool calls and usage). This covers both the app and `npm run nemotron:chat`. Set server-side `NEMOTRON_LOG_PATH` to change the file location. Logs are excluded from Git; authorization headers are never recorded. A write failure stops the request with an error rather than applying an unsaved response. Existing responses from before logging was added cannot be recovered from this file.

A standalone destination alternative defaults to an independent timeline from baseline finances. Continuing an existing move requires that intent in the current message or conversation; selecting New York alone does not request inheriting its events.

## SpacetimeDB

The TypeScript module is in `spacetimedb/src/index.ts`; generated SDK bindings are checked in at `src/module_bindings`. Private `workspace` and `account` tables store financial workspaces and user profiles. Public `my_workspace` and `my_account` views expose only the authenticated caller's row using `ctx.sender`. Reducers also derive the owner from the caller; no caller can supply someone else's identity. Workspaces use optimistic revision checks, including initial creation.

Accounts store a display name, verified email (when supplied by SpacetimeAuth), authentication status, and creation/update timestamps. Email comes from server-validated JWT claims, never a browser form. Click your sidebar name (Edit profile), or open Settings → Your account, to change the display name. The sidebar name and initials follow the SpacetimeDB account subscription, including edits from another connection. Passwords and recovery are handled by SpacetimeAuth. The financial data is labeled Financial profile in Settings and do not supply the sidebar identity.

The prepared workspace now uses the hosted [Ping database](https://spacetimedb.com/@vinhnguyentcu/ping-financial-multiverse-6a1h3). Its module and SpacetimeAuth client are deployed and `.env.local` is configured:

```dotenv
VITE_SPACETIMEDB_URI=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=ping-financial-multiverse-6a1h3
VITE_SPACETIMEAUTH_CLIENT_ID=client_034u7GevSYr8WQlN8ObOSR
```

Email magic-link login is enabled, with callback and logout URLs for both `127.0.0.1:5173` and `localhost:5173`. Hosted anonymous login is disabled; the app's separate guest option still works. The CLI is authenticated to the owner account for later publishes. This only hosts the database and authentication; the React app and Nemotron middleware still run locally.

For a separate local database, install the [official SpacetimeDB CLI](https://spacetimedb.com/install). A project-local CLI under `.spacetime/bin` is also recognized. Set the local values below before running these commands in separate terminals:

```sh
npm run db:start
npm run db:publish
```

Set these values in `.env.local`, then restart Vite:

```dotenv
VITE_SPACETIMEDB_URI=ws://127.0.0.1:3000
VITE_SPACETIMEDB_DATABASE=ping-accounts-local
```

The previous `ping-local` and `ping-accounts-local` databases are preserved. Their original anonymous publisher identities differ from the current cloud login; use a new local database name for new local development. The publish script reads the URI/name from `.env.local` (or `SPACETIMEDB_URI` / `SPACETIMEDB_DATABASE` environment overrides).

If the database is unavailable, the UI reports the connection status and keeps changes locally. Guests retain a database-scoped SDK token in localStorage. Guests cannot recover that identity after clearing storage or use it automatically on another device.

### Enable account sign-in

1. Create a SpacetimeAuth project and a public web OAuth client using the [official setup and React integration guide](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/react-integration/). Enable email login or your chosen identity providers there.
2. Allow redirect URI `http://127.0.0.1:5173/callback` and post-logout URI `http://127.0.0.1:5173`. Add corresponding production URLs when deploying. `localhost` and `127.0.0.1` are different origins.
3. Set `VITE_SPACETIMEAUTH_CLIENT_ID` to the public client ID in `.env.local`, then restart Vite. No client secret belongs in the frontend.

Visitors see the Ping homepage at `/`, with separate sign-in (`/#/signin`) and sign-up (`/#/signup`) pages and guest access. Both account pages continue to the same SpacetimeAuth passwordless flow: first authentication creates an account, and returning users recover their existing identity. The hosted provider manages credentials; Ping stores the display name, verified email, timestamps, and identity-owned workspace in private SpacetimeDB tables. The homepage remains available without an auth client configured, with account actions disabled and guest access enabled.

OAuth uses authorization code with PKCE and automatic token renewal through `react-oidc-context`. The ID token authenticates the database connection. Signing out unmounts the account workspace; switching users remounts it with a separate local cache. Silent token renewal keeps the workspace mounted. Existing signed-in workspaces load from SpacetimeDB on another device. Guest data is kept separate and is not automatically imported into an account.

Homepage/auth verification: 121 automated tests passed, including hosted redirect actions, redirect failures, expired sessions, silent renewal, guest entry/exit, and missing configuration. Production build, database type check, and live cloud persistence/privacy checks passed. These new pages have not had visual browser QA or a real inbox email-link login test in this pass.

Verification on November 8, 2026: cloud integration checks passed for persistence, restore, live updates, profile validation, stale-write rejection and cross-user privacy. Browser verification completed the OAuth callback using a temporary anonymous SpacetimeAuth user, connected to the hosted database, and saved/restored an account display name. Anonymous hosted login was then disabled. Email delivery and the email-link login itself require a user's inbox and have not been tested.

After changing the database schema, run `npm run db:generate` and republish. Data files and binaries under `.spacetime/` are ignored by Git.

## Financial model

In **My Baseline → Edit baseline**, edit salary, tax rate, account balances, expenses, investment assumptions, and existing debt balances/APRs/payments. **Save baseline** records the change, recalculates active projections, and queues the updated workspace through the existing SpaceTimeDB sync. New branches use the saved profile; archived snapshots remain intact. Cancel discards the draft, and a profile changed by another update must be reopened before saving. Offline changes retain the existing local-save behavior and connection-status feedback.

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
# Sends five fixture turns to the configured live Nemotron deployment:
npm run test:lifecycle:live
```

Tests cover financial calculations, scenario interactions, account editing feedback and local account-cache isolation. The real database check verifies persistence, restore on a second connection, reactive updates, stale-write rejection, profile validation, and isolation from a different identity through both views and direct SQL.

Lifecycle verification: 73 automated tests, production build, database type check, real database persistence/concurrency check, and an asserted five-turn live Nemotron smoke test pass. The composer journey is tested in jsdom; no visual browser QA was performed for this change.

## References

- [SpacetimeDB TypeScript client](https://spacetimedb.com/docs/clients/typescript/)
- [SpacetimeDB reducers](https://spacetimedb.com/docs/functions/reducers/)
- [NVIDIA Nemotron 3.5 Bolt E4B](https://build.nvidia.com/nvidia/nemotron-3.5-bolt-e4b)

Timeline details separate fixed 36-month outcomes from the inspected month, show minimum checking-plus-savings with a month jump, and expose all grouped events. Historical snapshots disclose their profile/date basis and omit misaligned comparisons. Existing saved conversations and notifications remain historical text. See [timeline results implementation](docs/timeline-results-plan.md#implementation-outcome--2026-11-08).
