/*
Remote: Synchronizing a syncdocs that may be on completely
different servers, e.g., one is local and another is remote.

Synchronize the state of this with an completely different doc,
possibly with an entirely different client (so on a different
server altogether).
This is not efficient yet, but there are some steps to make it
efficient, and also obviously we need to take into account
snapshots properly.  This is a quick proof of concept to see
how this feels.  This feels like "the merge operation of a CRDT".
*/

import { type SyncDoc } from "./sync-doc";

export function push({
  local,
  remote,
  source,
}: {
  local: SyncDoc;
  remote: SyncDoc;
  source?;
}) {
  const X = local.patches_table.get();
  if (X == null) {
    throw Error("patches_table not initialized");
  }
  const Y = remote.patches_table.get();
  if (Y == null) {
    throw Error("remote patches_table not initialized");
  }
  for (const key in X) {
    // @ts-ignore
    const key1 = remote.patches_table.getKey(X[key]);
    if (Y[key1] === undefined) {
      // console.log("push", JSON.stringify(X[key]));
      let obj = X[key];
      if (source != null) {
        obj = { source, ...X[key] };
      }
      remote.patches_table.set(obj, "none");
    }
  }
}
