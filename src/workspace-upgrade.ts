import type { AppState } from "./types";

/** Requested one-time reset to Main Reality; future user-created branches are retained. */
export function upgradeWorkspace(state: AppState): AppState {
  if ((state.examplesVersion ?? 0) >= 2) return state;
  return {
    ...state,
    examplesVersion: 2,
    universes: [],
    notices: state.notices.filter((notice) => !notice.universeId),
  };
}
