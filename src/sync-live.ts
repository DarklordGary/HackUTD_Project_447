import { DbConnection } from "./module_bindings";
import { workspaceSchema } from "./contracts";
import type { AppState } from "./types";
export function connectLive(
  onRemote: (state: AppState) => void,
  onStatus: (s: string) => void,
) {
  let ready = false,
    closed = false,
    writing = false,
    revision = 0;
  let queued: AppState | undefined;
  let lastPayload = "";
  const database = import.meta.env.VITE_SPACETIMEDB_DATABASE;
  const uri = import.meta.env.VITE_SPACETIMEDB_URI || "ws://127.0.0.1:3000";
  const tokenKey = `ping.spacetime.token.${uri}.${database}`;
  const connection = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database)
    .withToken(localStorage.getItem(tokenKey) || undefined)
    .onConnect((conn, identity, token) => {
      if (closed) {
        conn.disconnect();
        return;
      }
      localStorage.setItem(tokenKey, token);
      const apply = () => {
        const row = conn.db.workspace.owner.find(identity);
        if (!row || row.payload === lastPayload) return;
        try {
          const remote = workspaceSchema.parse(JSON.parse(row.payload));
          if (
            remote.version !== 1 ||
            !remote.profile ||
            !Array.isArray(remote.universes)
          )
            return;
          revision = row.revision;
          lastPayload = row.payload;
          if (!writing) {
            queued = undefined;
            onRemote(remote);
          }
        } catch {
          onStatus("Cloud state unreadable · saved locally");
        }
      };
      conn.db.workspace.onInsert(apply);
      conn.db.workspace.onUpdate(apply);
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          apply();
          ready = true;
          onStatus("Live with SpacetimeDB");
          void flush();
        })
        .onError(() => onStatus("Sync interrupted · saved locally"))
        .subscribe(
          `SELECT * FROM workspace WHERE owner = 0x${identity.toHexString()}`,
        );
    })
    .onConnectError(() => onStatus("SpacetimeDB unavailable · saved locally"))
    .onDisconnect(() => {
      ready = false;
      if (!closed) onStatus("Disconnected · saved locally");
    })
    .build();
  async function flush() {
    if (closed || !ready || writing || !queued) return;
    const payload = JSON.stringify(queued);
    queued = undefined;
    if (payload === lastPayload) return;
    writing = true;
    try {
      await connection.reducers.saveWorkspace({
        payload,
        expectedRevision: revision,
      });
      const row = connection.identity
        ? connection.db.workspace.owner.find(connection.identity)
        : undefined;
      revision = row?.revision ?? revision + 1;
      lastPayload = payload;
      onStatus("Live with SpacetimeDB");
    } catch (error) {
      const row = connection.identity
        ? connection.db.workspace.owner.find(connection.identity)
        : undefined;
      if (row && row.revision > revision) {
        revision = row.revision;
        lastPayload = row.payload;
        queued = undefined;
        onRemote(workspaceSchema.parse(JSON.parse(row.payload)));
      }
      onStatus(
        error instanceof Error && /changed/.test(error.message)
          ? "Another tab updated · reapply your change"
          : "Sync failed · saved locally",
      );
    } finally {
      writing = false;
      if (queued) void flush();
    }
  }
  return {
    save(state: AppState) {
      queued = state;
      void flush();
    },
    close() {
      closed = true;
      connection.disconnect();
    },
  };
}
