import { DbConnection } from "../src/module_bindings";
import { seedExamples as seed } from "../src/seed-fixtures.test-support";
import { loadEnv } from "vite";
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env };
const uri = env.SPACETIMEDB_URI || env.VITE_SPACETIMEDB_URI || "ws://127.0.0.1:3000";
const database = env.SPACETIMEDB_DATABASE || env.VITE_SPACETIMEDB_DATABASE || "ping-accounts-local";
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
let first: DbConnection, second: DbConnection, stranger: DbConnection;
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
              const row = conn.db.myWorkspace.owner.find(identity);
              if (!row || row.revision !== 1)
                throw new Error("Initial save not observed");
              resolve();
            } catch (e) {
              reject(e);
            }
          })
          .onError((_ctx, e) => reject(e))
          .subscribe(
            `SELECT * FROM my_workspace WHERE owner = 0x${identity.toHexString()}`,
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
              const row = conn.db.myWorkspace.owner.find(identity);
              if (!row || JSON.stringify(JSON.parse(row.payload)) !== JSON.stringify(state))
                throw new Error("Persisted workspace was not restored");
              first.db.myWorkspace.onUpdate((_ctx, _oldRow, newRow) => {
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
            `SELECT * FROM my_workspace WHERE owner = 0x${identity.toHexString()}`,
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
  await first!.reducers.updateAccount({ displayName: "Account fixture" });
  await new Promise<void>((resolve, reject) => {
    first!.subscriptionBuilder().onApplied(() => {
      try {
        const account = first!.db.myAccount.owner.find(first!.identity!);
        if (account?.displayName !== "Account fixture" || account.email || account.authenticated)
          throw new Error("Guest profile did not persist correctly");
        resolve();
      } catch (e) { reject(e); }
    }).onError((_ctx, e) => reject(e)).subscribe("SELECT * FROM my_account");
  });
  let invalidNameRejected = false;
  try { await first!.reducers.updateAccount({ displayName: " " }); }
  catch { invalidNameRejected = true; }
  if (!invalidNameRejected) throw new Error("Blank account name accepted");
  // A separate connection must restore the profile from the database, not UI state.
  await new Promise<void>((resolve, reject) => {
    second!.subscriptionBuilder().onApplied(() => {
      const account = second!.db.myAccount.owner.find(second!.identity!);
      if (account?.displayName !== "Account fixture") reject(new Error("Profile was not restored on a second connection"));
      else resolve();
    }).onError((_ctx, e) => reject(e)).subscribe("SELECT * FROM my_account");
  });
  const renamed = new Promise<void>(resolve => {
    second!.db.myAccount.onUpdate((_ctx, _previous, row) => {
      if (row.displayName === "Renamed account fixture") resolve();
    });
  });
  await first!.reducers.updateAccount({ displayName: "Renamed account fixture" });
  await renamed;
  await new Promise<void>((resolve, reject) => {
    stranger = DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect((conn, _identity, strangerToken) => {
        conn.subscriptionBuilder().onApplied(async () => {
          try {
            if ([...conn.db.myWorkspace.iter()].length || [...conn.db.myAccount.iter()].length)
              throw new Error("Another identity can read private data");
            for (const table of ["workspace", "account"]) {
              const response = await fetch(`${uri.replace(/^ws/, "http")}/v1/database/${database}/sql`, {
                method: "POST", headers: { Authorization: `Bearer ${strangerToken}` }, body: `SELECT * FROM ${table}`,
              });
              if (response.ok) throw new Error(`Private ${table} table is directly readable`);
            }
            const account = first!.db.myAccount.owner.find(first!.identity!);
            if (account?.displayName !== "Renamed account fixture") throw new Error("Profile rename did not persist");
            resolve();
          } catch (e) { reject(e); }
        }).onError((_ctx, e) => reject(e)).subscribe(["SELECT * FROM my_workspace", "SELECT * FROM my_account"]);
      }).onConnectError((_ctx, e) => reject(e)).build();
  });
  console.log(
    "PASS: workspace persistence, restore, live updates, stale-write rejection, account persistence/restore/rename across connections, name validation, and cross-user read isolation (views and direct SQL).",
  );
} finally {
  clearTimeout(timeout);
  first!?.disconnect();
  second!?.disconnect();
  stranger!?.disconnect();
}
