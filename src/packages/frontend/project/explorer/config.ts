/*
Store how a user has configured the view of a given directory.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type DKV } from "@cocalc/conat/sync/dkv";
import { type SortField } from "@cocalc/frontend/project/listing/use-listing";
import { dirname } from "path";

const NAME = "cocalc-explorer-config";

let kv: DKV | null = null;
async function init() {
  if (kv == null) {
    kv = await webapp_client.conat_client.dkv({
      name: NAME,
      account_id: webapp_client.account_id,
    });
  }
}

interface Location {
  project_id: string;
  compute_server_id?: number;
  path?: string;
}

function key({ project_id, compute_server_id = 0, path = "" }: Location) {
  return `${project_id}-${compute_server_id}-${path}`;
}

export function get(location: Location) {
  if (kv == null) {
    init();
    return undefined;
  }
  return kv.get(key(location));
}

export async function set(
  opts: Location & {
    config: any;
  },
) {
  if (kv == null) {
    try {
      await init();
    } catch (err) {
      console.log("WARNING: issue initializing explorer config", err);
      return;
    }
  }
  if (kv == null) {
    // this should never happen
    return;
  }
  const k = key(opts);
  kv.set(k, { ...kv.get(k), ...opts.config });
}

const FALLBACK_SORT = { column_name: "name", is_descending: false } as const;

export function getSort(location: Location): {
  column_name: SortField;
  is_descending: boolean;
} {
  if (kv == null) {
    init();
    return FALLBACK_SORT;
  }
  const { sort } = get(location) ?? {};
  if (sort == null) {
    return getDefaultSort(location);
  } else {
    return sort;
  }
}

// assuming that location has no defined sort, come
// up with a default based on nearby usage...
export function getDefaultSort(location: Location) {
  if (kv == null || !location.path) {
    return FALLBACK_SORT;
  }
  let path = dirname(location.path);
  while (true) {
    const x = get({ ...location, path }) ?? {};
    if (x.sort != null) {
      return x.sort;
    }
    const newPath = dirname(path);
    if (newPath.length >= path.length) {
      break;
    }
    path = newPath;
  }
  // nothing in this tree.
  // try to find any preference from this user
  // ever (could restrict to the project)
  for (const x in kv.keys()) {
    const { sort } = kv.get(x) ?? {};
    if (sort != null) {
      return sort;
    }
  }
  return FALLBACK_SORT;
}

export function setSort({
  column_name,
  ...location
}: Location & { column_name: string }) {
  const cur = getSort(location);
  let is_descending =
    cur == null || column_name != cur.column_name ? false : !cur?.is_descending;
  set({ ...location, config: { sort: { column_name, is_descending } } });
}
