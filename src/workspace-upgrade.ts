import type { AppState } from "./types";

/** Requested one-time reset to Main Reality; future user-created branches are retained. */
export function upgradeWorkspace(state: AppState): AppState {
  if ((state.examplesVersion ?? 0) >= 2) {
    if (!state.universes.some(u => u.archived && (!u.archiveReason || !u.finalProfile))) return state;
    return { ...state, universes: state.universes.map(u => u.archived ? {
      ...u, archiveReason: u.archiveReason ?? "manual", finalProfile: u.finalProfile ?? structuredClone(state.profile),
    } : u) };
  }
  return {
    ...state,
    examplesVersion: 2,
    universes: [],
    notices: state.notices.filter((notice) => !notice.universeId),
  };
}
