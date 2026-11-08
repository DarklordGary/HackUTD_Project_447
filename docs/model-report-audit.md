# Model cleanup report audit

Grade: B (82/100).

The report is strong at spotting mechanical leftovers, but too quick to treat legacy code and reduced navigation access as evidence for deletion. Evaluation uses the current working tree, which already contained edits when the audit began; historical observations may have been accurate on an older revision.

| Report finding | Verdict and action |
| --- | --- |
| MiniLandscape has no callers | Confirmed; removed. UniverseIcon also has no callers after removing its unused App import, so removed that component and its exclusive icon imports too. |
| timelineView and the listed App icons are unused | Confirmed; removed state and unused imports. |
| money imports in TimelineCanvas/usePing, mergeEvents in lifecycle.test, toolDefinitions in agent.test | Confirmed; removed. |
| Interface mode is obsolete | Partly true: the agent does not read context.mode, but the client uses mode as an operation fallback and to display reality-result actions. Retained the state and request contract to preserve behavior. |
| Merge heuristics are superseded | Live operations use exact IDs, but offline model fixtures and engine tests still exercise the fallback. These branches are reachable, not dead. Retained. |
| interpreter contract re-exports are leftovers | Confirmed; state was still consuming the Interpretation type through that re-export. Moved its import to contracts and removed the re-exports. |
| Starter universes are immediately discarded | Confirmed for application startup/reset. However, tests and the sync integration script use the examples. Moved them into seed-fixtures.test-support.ts and updated those consumers. Production seed now returns examplesVersion 2 with empty universes/notices; old-workspace migration remains. |
| Updates view is orphaned | Overstated: the composer exposes a See what changed action after reality updates that navigates to Updates. Retained the view and notice handling. Removed only the unused unread count. |
| Help modal is detached on desktop | Desktop trigger removal is accurate; mobile help still opens the shared modal. Retained it. |
| Storage status only appears in Settings | Accurate; this is still a consumer, so retained storage state. |
| More than 500 lines of dead CSS | Listed selector families are unused, but the size estimate is exaggerated for this checkout. Removed 79 obsolete selectors / 337 lines from styles.css and 22 selectors / 65 lines from responsive.css. In shared selector lists only obsolete selectors were removed; active declarations were preserved. |
| TimelineCanvas.test.ts is superseded | Incorrect deletion implication. It includes out-of-order parent/child and malformed-parent-cycle checks that the DOM suite does not replace. Both files retained. |
| Chicago migration documentation is stale | Confirmed; replaced with the current Main Reality reset and clarified map-only behavior. |
| Two App tests fail after Update reality removal | Not reproducible in the starting tree: 10 files / 74 tests passed before cleanup. No tests removed to force a pass. |

## Verification

After cleanup, the full unit suite and TypeScript/Vite production build pass. Concurrent unrelated work added two tests during the audit, yielding 76 passing tests in 10 files. The fresh-seed migration test now directly checks the production seed and that upgrading it preserves identity and later branches. Existing example-based regression coverage uses an explicit historical fixture. Live Nemotron and database integration checks require running services and were not run for this local cleanup.

Scoring: 37/40 for mechanical findings, 22/30 for reachability and deletion judgment, 15/20 for coverage and reproducibility, and 8/10 for clarity. The concrete locations are useful; the main deductions are for the duplicate-test inference, incomplete mode analysis, exaggerated CSS estimate, and stale failure claim.
