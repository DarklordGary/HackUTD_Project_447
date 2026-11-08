# Ping interaction design

This pass applies the installed UI/UX Pro Max skill to the existing React app. Brand constraints take priority: the parrot artwork, green primary (`#3c6145`), sage surfaces, white cards, and pale background (`#f5f6f3`) remain.

The verified style match was Minimalism & Swiss Style, with spacious density and subtle motion. Marketing-page patterns, replacement palettes and font recommendations from the search output were not applicable and were not used. The database search did not return a relevant progressive-disclosure match after its retry; that guidance comes from the skill's built-in `quick-reference.md` rules for progressive disclosure, focus management, reduced motion, and readable data.

- The workspace uses the timeline map at all screen sizes. The default selection includes up to three root futures and two children per parent. The Branches dropdown explicitly controls the map: only checked universes render, with no automatic parent inclusion or hidden display limit. Show all / Hide all are available; choices persist locally. Colors are resolved against the full workspace so filtering does not recolor a universe.
- The map uses muted sage, dusty plum, and warm ochre for three root families with equal-width (7 SVG units) branches; child paths use coordinated shades of the parent family. It retains a quiet lead-in, broad S-curves, origin/fork dots, labels above the start of each flat section, and dotted continuations. Readiness scoring and width explanations have been removed.
- A bottom calendar axis shows ticks every three months. Every event uses the same linear month-to-x mapping across all universes, including child branches; its y coordinate follows the actual curve at that x. A hovered event has a vertical guide to the axis. Nearby months use nonoverlapping hit areas so each dot remains independently inspectable. Changing the horizon rescales the axis and dots together; later events are hidden until their date is in range. Actual dates also appear in event details.
- Event detail cards are portaled to the document body and positioned against the triggering dot using fixed viewport coordinates. They flip above lower branches and clamp to the viewport. They cannot expand the graph scroller or introduce graph scrollbars; moving from the chart to the popup keeps it open.
- Hover or keyboard focus emphasizes a branch and dims the other routes. Event targets are rendered last, above route and label hit areas. Pointer entry, focus, or tap reveals grouped monthly events immediately, with no popup delay or animation. Escape dismisses details; Explore this month opens the matching universe and month.
- One primary action: create a universe. Compare remains secondary.
- Branch detail leads with its chart, two outcomes, and branching/editing actions. Scheduled events, assumptions, milestones, extra actions and the full financial breakdown are disclosed on demand.
- Baseline cards lead with their totals. Individual income/expense/account lines, debts and investments remain available without filling the initial screen.
- Ask Ping stays visible as a compact composer. Ctrl/Cmd+K focuses its input. Focusing or clicking the input does not expand anything or issue a request. Submitting shows the conversation inline, with the user message and an immediate loading indicator until the request resolves. Show conversation / Hide conversation control history without a dialog or overlay. Modal dialogs trap focus and restore the opener.
- Failed requests retain the draft and show an inline error. Retrying replaces the pending user entry rather than duplicating it.

## Motion

Feedback uses 150ms transitions; popovers and page changes use up to 240ms deceleration. Presses respond with a small stable transform, chart values fade into their final calculated number, focused timeline paths gain emphasis, and active requests show a typing indicator. No interpolated financial numbers or fake progress percentages are shown. No animation library is required.

All nonessential animations, transitions and smooth conversation scrolling respect `prefers-reduced-motion`. Buttons and disclosure controls use generous target areas; diagram markers have expanded invisible hit areas. Meaningful text uses dark foreground or muted green with at least 4.5:1 contrast against its surface.

The financial engine, Nemotron tool interface, profile and timeline persistence are preserved. Conversation draft/error feedback and duplicate prevention on retry remain in place.

A + action on each displayed branch opens Ping in branch mode for that universe. Child routes connect to their parent path. A child shows new or changed event markers, while inherited unchanged events stay on the parent route. Events at distinct months each receive a marker; same-month events share one popup. The underlying child simulation still includes its inherited event history. No saved universes or financial events are discarded by map filtering.

Fresh workspaces start with Main Reality and no example universes or notices (`examplesVersion: 2`). The one-time upgrade clears branches and their linked notices from older workspaces; later user-created branches are preserved. Historical example scenarios live only in test fixtures.


## Responsive behavior

The responsive layer preserves the current theme and logo. The universe SVG scales uniformly to its available frame using its viewBox; the canvas has no internal scrolling or forced minimum diagram width. Branch selection, Compare paths, and New universe share one toolbar and wrap into two logical rows on phones.

Other pages scroll within the workspace, so long baseline, settings, and branch details remain accessible. Cards stack at narrower widths; comparison tables scroll within their own container. Financial projection charts measure available width with ResizeObserver and simplify tick density on narrow screens. Branch menus use available vertical space. Mobile navigation reserves its own safe-area space, and a compact app bar retains home and help access.

Chat includes visible history controls, 16px form text on phones, and an inline conversation panel capped to half the available viewport. VisualViewport updates resize the application frame for the on-screen keyboard, keeping the input in view without a fixed chat overlay. The mode dropdown is removed; the composer accepts natural-language messages with read-only universe context. No new intent-classification rules or backend inference changes are introduced in this UI pass; Nemotron routing changes are deferred to the next requested backend update. Reduced motion remains supported. Automated interaction checks cover narrow-screen navigation, closing chat with focus restoration, and keyboard viewport changes. Browser-based visual verification was unavailable in this environment.


## Marker and responsive polish

An extra filled circle at the end of each branch curve was nearly coincident with the Chicago move event. That decorative terminal dot is removed. Branch junctions use small hollow diamonds; actual financial events remain hollow circles, including hover/focus/selected states. Same-month events still share one marker, and neighboring dates remain separate. The Chicago move/rent and following-month refund are unchanged.

The skill's verified touch-friendly and touch-spacing guidance informed larger navigation targets, more consistent control spacing, clear pressed states, keyboard-visible branch filters, and a mobile Settings entry. The map still scales to its frame without internal scrolling; chat remains inline and does not open on input focus. Chat uses a stable width between idle and conversation states, a viewport-aware minimum reading area, and temporarily frees mobile navigation space when the keyboard is detected. No inference behavior changed.

## Nemotron integration

The Node backend now uses the official OpenAI SDK against the supplied Brev Nemotron endpoint. The inline chat continues to show real request loading, with no manual mode selection. The model chooses an action through select_action; server-side tool availability follows that action and requires a calculated preview before a persisted change can be returned. Client state application uses the returned operation rather than its legacy navigation mode. Production phrase-rule interpretation has been removed; exact prerecorded model fixtures are used only by offline tests. Standalone CLI requests support reasoning output and a thinking toggle; raw reasoning is not sent to the UI.
