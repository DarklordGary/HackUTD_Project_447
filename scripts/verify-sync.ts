import { DbConnection } from "../src/module_bindings";
import { seed } from "../src/seed";
const uri = process.env.SPACETIMEDB_URI || "ws://127.0.0.1:3000";
const database = process.env.SPACETIMEDB_DATABASE || "ping-local";
const state = seed();
state.examplesVersion = 2;
state.appliedOperationIds = ["sync-realization-fixture"];
state.conversation = [{ id: "sync-message", role: "user", text: "I moved" }];
state.universes[0].archived = true;
state.universes[0].archiveReason = "realized";
state.universes[0].realityChangeId = "sync-realization-fixture";
state.profile.actualEvents = [{ id: "sync-realization-fixture", effectiveDate: "2026-11-08", sourceUniverseId: state.universes[0].id,
  events: [{ id: "actual-moving-cost", kind: "expense", month: 1, amount: 4500, estimated: true, label: "Actual moving cost estimate" }] }];
let token = "";
let first: DbConnection, second: DbConnection;
const timeout = setTimeout(() => {
  console.error("SpacetimeDB integration check timed out");
  process.exit(1);
}, 15000);
try {
  await new Promise<void>((resolve, reject) => {
    first = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((conn, identity, receivedToken) => {
        token = receivedToken;
        conn
          .subscriptionBuilder()
          .onApplied(async () => {
            try {
              await conn.reducers.saveWorkspace({
                payload: JSON.stringify(state),
                expectedRevision: 0,
              });
              const row = conn.db.workspace.owner.find(identity);
              if (!row || row.revision !== 1)
                throw new Error("Initial save not observed");
              resolve();
            } catch (e) {
              reject(e);
            }
          })
          .onError((_ctx, e) => reject(e))
          .subscribe(
            `SELECT * FROM workspace WHERE owner = 0x${identity.toHexString()}`,
          );
      })
      .onConnectError((_ctx, e) => reject(e))
      .build();
  });
  await new Promise<void>((resolve, reject) => {
    second = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(async () => {
            try {
              const row = conn.db.workspace.owner.find(identity);
              if (!row || JSON.stringify(JSON.parse(row.payload)) !== JSON.stringify(state))
                throw new Error("Persisted workspace was not restored");
              first.db.workspace.onUpdate((_ctx, _oldRow, newRow) => {
                if (
                  newRow.revision === 2 &&
                  JSON.parse(newRow.payload).profile.annualSalary === 90000
                )
                  resolve();
              });
              const next = structuredClone(state);
              next.profile.annualSalary = 90000;
              await conn.reducers.saveWorkspace({
                payload: JSON.stringify(next),
                expectedRevision: row.revision,
              });
            } catch (e) {
              reject(e);
            }
          })
          .onError((_ctx, e) => reject(e))
          .subscribe(
            `SELECT * FROM workspace WHERE owner = 0x${identity.toHexString()}`,
          );
      })
      .onConnectError((_ctx, e) => reject(e))
      .build();
  });
  let rejected = false;
  try {
    await second!.reducers.saveWorkspace({
      payload: JSON.stringify(state),
      expectedRevision: 0,
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Stale revision was accepted");
  console.log(
    "PASS: workspace persisted, restored on a second connection, reactively updated, and stale revision rejected.",
  );
} finally {
  clearTimeout(timeout);
  first!?.disconnect();
  second!?.disconnect();
}
