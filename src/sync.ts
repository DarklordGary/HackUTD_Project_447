import type { AppState } from "./types";
export type AccountProfile = { displayName: string; email: string; authenticated: boolean };
export type SyncOptions = { token?: string; displayName?: string; onAccount?: (profile: AccountProfile) => void };
// The live SDK adapter is lazy-loaded only when SpacetimeDB is configured.
export function connectPersistence(
  onRemote: (state: AppState) => void,
  onStatus: (s: string) => void,
  options: SyncOptions = {},
) {
  let closed = false;
  let adapter: { save: (state: AppState) => void; close: () => void; saveAccount: (displayName: string) => Promise<void> } | null =
    null;
  let queued: AppState | undefined;
  if (import.meta.env.VITE_SPACETIMEDB_DATABASE) {
    onStatus("Connecting to SpacetimeDB…");
    import("./sync-live")
      .then(({ connectLive }) => {
        if (closed) return;
        adapter = connectLive(onRemote, onStatus, options);
        if (queued) adapter?.save(queued);
      })
      .catch(() => onStatus("SpacetimeDB unavailable · saved locally"));
  }
  return {
    async saveAccount(displayName: string) {
      if (!adapter) throw new Error("Connect to SpacetimeDB before saving your profile.");
      await adapter.saveAccount(displayName);
    },
    save(state: AppState) {
      queued = state;
      adapter?.save(state);
    },
    close() {
      closed = true;
      adapter?.close();
    },
  };
}
