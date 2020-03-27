const json_stable_stringify = require("json-stable-stringify");
import { delay } from "awaiting";

import { SyncTable } from "./synctable";

const synctables = {};

// for debugging; in particular, verify that synctables are freed.
// Do not leave in production; could be slight security risk.
//# window?.synctables = synctables

export function synctable(
  query,
  options,
  client,
  throttle_changes: undefined | number,
  use_cache: boolean = true
): SyncTable {
  if (options == null) {
    options = [];
  }
  if (!use_cache) {
    return new SyncTable(query, options, client, throttle_changes);
  }

  const cache_key = json_stable_stringify({
    query,
    options,
    throttle_changes,
  });
  let S: SyncTable | undefined = synctables[cache_key];
  if (S != null) {
    if (S.get_state() === "connected") {
      // same behavior as newly created synctable
      emit_connected_in_next_tick(S);
    }
  } else {
    S = synctables[cache_key] = new SyncTable(
      query,
      options,
      client,
      throttle_changes
    );
    S.cache_key = cache_key;
  }
  S.reference_count += 1;
  return S;
}

async function emit_connected_in_next_tick(S: SyncTable): Promise<void> {
  await delay(0);
  if (S.get_state() === "connected") {
    S.emit("connected");
  }
}

export function global_cache_decref(S: SyncTable): boolean {
  if (S.reference_count && S.cache_key !== undefined) {
    S.reference_count -= 1;
    if (S.reference_count <= 0) {
      delete synctables[S.cache_key];
      return false; // not in use
    } else {
      return true; // still in use
    }
  }
  return false;
}
