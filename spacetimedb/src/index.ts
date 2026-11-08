import { schema, table, t, SenderError } from "spacetimedb/server";
// Private storage; clients can subscribe only to their own views below.
const workspace = table(
  { name: "workspace" },
  {
    owner: t.identity().primaryKey(),
    payload: t.string(),
    revision: t.u32(),
  },
);
const account = table({ name: "account" }, {
  owner: t.identity().primaryKey(),
  displayName: t.string(),
  email: t.string(),
  authenticated: t.bool(),
  createdAt: t.timestamp(),
  updatedAt: t.timestamp(),
});
const spacetime = schema({ workspace, account });
export default spacetime;
export const my_workspace = spacetime.view(
  { name: "my_workspace", public: true }, t.option(workspace.rowType),
  ctx => ctx.db.workspace.owner.find(ctx.sender) ?? undefined,
);
export const my_account = spacetime.view(
  { name: "my_account", public: true }, t.option(account.rowType),
  ctx => ctx.db.account.owner.find(ctx.sender) ?? undefined,
);
export const update_account = spacetime.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const name = displayName.trim();
    if (!name || name.length > 80) throw new SenderError("Use a display name between 1 and 80 characters.");
    const jwt = ctx.senderAuth.jwt;
    const authenticated = jwt?.issuer === "https://auth.spacetimedb.com/oidc";
    const claims = jwt?.fullPayload;
    const email = authenticated && claims?.email_verified === true && typeof claims.email === "string" ? claims.email : "";
    const current = ctx.db.account.owner.find(ctx.sender);
    const row = { owner: ctx.sender, displayName: name, email, authenticated,
      createdAt: current?.createdAt ?? ctx.timestamp, updatedAt: ctx.timestamp };
    if (current) ctx.db.account.owner.update(row);
    else ctx.db.account.insert(row);
  },
);
export const save_workspace = spacetime.reducer(
  { payload: t.string(), expectedRevision: t.u32() },
  (ctx, { payload, expectedRevision }) => {
    if (payload.length > 2000000)
      throw new SenderError("Workspace is too large");
    const data = JSON.parse(payload);
    if (data.version !== 1 || !data.profile || !Array.isArray(data.universes))
      throw new SenderError("Invalid workspace");
    const current = ctx.db.workspace.owner.find(ctx.sender);
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new SenderError(
        "Workspace changed in another tab. Please retry your change.",
      );
    const row = {
      owner: ctx.sender,
      payload,
      revision: (current?.revision ?? 0) + 1,
    };
    if (current) ctx.db.workspace.owner.update(row);
    else ctx.db.workspace.insert(row);
  },
);
