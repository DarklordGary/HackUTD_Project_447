import { schema, table, t, SenderError } from "spacetimedb/server";
// Single seeded workspace per anonymous SDK identity. No authentication UI or account collection.
const workspace = table(
  { name: "workspace", public: true },
  {
    owner: t.identity().primaryKey(),
    payload: t.string(),
    revision: t.u32(),
  },
);
const spacetime = schema({ workspace });
export default spacetime;
export const save_workspace = spacetime.reducer(
  { payload: t.string(), expectedRevision: t.u32() },
  (ctx, { payload, expectedRevision }) => {
    if (payload.length > 2000000)
      throw new SenderError("Workspace is too large");
    const data = JSON.parse(payload);
    if (data.version !== 1 || !data.profile || !Array.isArray(data.universes))
      throw new SenderError("Invalid workspace");
    const current = ctx.db.workspace.owner.find(ctx.sender);
    if (current && current.revision !== expectedRevision)
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
