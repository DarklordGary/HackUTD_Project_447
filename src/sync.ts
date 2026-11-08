import type { AppState } from "./types";
// The live SDK adapter is lazy-loaded only when SpacetimeDB is configured.
export function connectPersistence(
  onRemote: (state: AppState) => void,
  onStatus: (s: string) => void,
) {
  let closed = false;
  let adapter: { save: (state: AppState) => void; close: () => void } | null =
    null;
  let queued: AppState | undefined;
  if (import.meta.env.VITE_SPACETIMEDB_DATABASE) {
    onStatus("Connecting to SpacetimeDB…");
    import("./sync-live")
      .then(({ connectLive }) => {
        if (closed) return;
        adapter = connectLive(onRemote, onStatus);
        if (queued) adapter?.save(queued);
      })
      .catch(() => onStatus("SpacetimeDB unavailable · saved locally"));
  }
  return {
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
