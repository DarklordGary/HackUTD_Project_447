# Ping interaction design

This pass applies the installed UI/UX Pro Max skill to the existing React app. Brand constraints take priority: the parrot artwork, green primary (`#3c6145`), sage surfaces, white cards, and pale background (`#f5f6f3`) remain.

The verified style match was Minimalism & Swiss Style, with spacious density and subtle motion. Marketing-page patterns, replacement palettes and font recommendations from the search output were not applicable and were not used. The database search did not return a relevant progressive-disclosure match after its retry; that guidance comes from the skill's built-in `quick-reference.md` rules for progressive disclosure, focus management, reduced motion, and readable data.

- One workspace at a time: Map or List. Narrow screens start with List. The default selection includes up to three root futures and two children per parent. The Branches dropdown explicitly controls the map: only checked universes render, with no automatic parent inclusion or hidden display limit. Show all / Hide all are available; choices persist locally. Colors are resolved against the full workspace so filtering does not recolor a universe.
- The map uses muted sage, dusty plum, and warm ochre for three root families with equal-width (7 SVG units) branches; child paths use coordinated shades of the parent family. It retains a quiet lead-in, broad S-curves, origin/fork dots, labels above the start of each flat section, and dotted continuations. Readiness scoring and width explanations have been removed.
- A bottom calendar axis shows ticks every three months. Every event uses the same linear month-to-x mapping across all universes, including child branches; its y coordinate follows the actual curve at that x. A hovered event has a vertical guide to the axis. Nearby months use nonoverlapping hit areas so each dot remains independently inspectable. Changing the horizon rescales the axis and dots together; later events are hidden until their date is in range. Actual dates also appear in event details. The larger, centered legend sits below the graph with 16px desktop / 14px mobile text and larger symbols.
- Event detail cards are portaled to the document body and positioned against the triggering dot using fixed viewport coordinates. They flip above lower branches and clamp to the viewport. They cannot expand the graph scroller or introduce graph scrollbars; moving from the chart to the popup keeps it open.
- Hover or keyboard focus emphasizes a branch and dims the other routes. Event targets are rendered last, above route and label hit areas. Pointer entry, focus, or tap reveals grouped monthly events immediately, with no popup delay or animation. Escape dismisses details; Explore this month opens the matching universe and month.
- One primary action: create a universe. Compare remains secondary.
- Branch detail leads with its chart, two outcomes, and branching/editing actions. Scheduled events, assumptions, milestones, extra actions and the full financial breakdown are disclosed on demand.
- Baseline cards lead with their totals. Individual income/expense/account lines, debts and investments remain available without filling the initial screen.
- Ask Ping stays visible as a compact composer. Ctrl/Cmd+K opens it; Escape closes it. Opening focuses the input; closing returns focus to the toggle. Modal dialogs trap focus and restore the opener.
- Failed requests retain the draft and show an inline error. Retrying replaces the pending user entry rather than duplicating it.

## Motion

Feedback uses 150ms transitions; popovers and page changes use up to 240ms deceleration. Presses respond with a small stable transform, chart values fade into their final calculated number, focused timeline paths gain emphasis, and active requests show a typing indicator. No interpolated financial numbers or fake progress percentages are shown. No animation library is required.

All nonessential animations, transitions and smooth conversation scrolling respect `prefers-reduced-motion`. Buttons and disclosure controls use generous target areas; diagram markers have expanded invisible hit areas. Meaningful text uses dark foreground or muted green with at least 4.5:1 contrast against its surface.

The financial engine, Nemotron tool interface, profile and timeline persistence are preserved. Conversation draft/error feedback and duplicate prevention on retry remain in place.

A + action on each displayed branch opens Ping in branch mode for that universe. Child routes connect to their parent path. A child shows new or changed event markers, while inherited unchanged events stay on the parent route. Events at distinct months each receive a marker; same-month events share one popup. The underlying child simulation still includes its inherited event history. No saved universes or financial events are discarded by map filtering.

A one-time workspace example migration adds Move to Chicago beneath the original New York chapter, preserving inherited events and adding explicitly estimated moving/rent/deposit events. It archives extra case-insensitive New York title matches without deleting their histories or descendant links. The marker persists with the workspace and prevents repeat insertion; the update applies to both local and synced workspaces. The underlying seed fixture remains unchanged.
