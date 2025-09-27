/*
Store how a user has configured the view of a given directory.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type DKV } from "@cocalc/conat/sync/dkv";
import { type SortField } from "@cocalc/frontend/project/listing/use-listing";
import { dirname } from "path";
import { redux } from "@cocalc/frontend/app-framework";

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

// if field is given, goes up the path searching for something with field set
export function get(location: Location, field?: string) {
  if (kv == null) {
    init();
    return undefined;
  }
  const value = kv.get(key(location));
  if (field && !value?.[field] && location.path) {
    let path = location.path;
    while (true) {
      const newPath = dirname(path);
      if (newPath.length >= path.length) {
        return undefined;
      }
      path = newPath;
      const value2 = get({ ...location, path });
      if (value2?.[field]) {
        return value2;
      }
    }
  }
  return value;
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

export function setSearch({ search, ...location }: Location & { search: any }) {
  set({
    ...location,
    // merge what was there with what's new
    config: { search: { ...get(location)?.search, ...search } },
  });
  const actions = redux.getProjectActions(location.project_id);
  actions.setState({ search_page: Math.random() });
  actions.search();
}

const FALLBACK_SEARCH = {
  subdirectories: true,
  case_sensitive: false,
  regexp: false,
  hidden_files: false,
  git_grep: true,
} as const;

export function getSearch(location) {
  if (kv == null) {
    init();
    return FALLBACK_SEARCH;
  }
  const { search } = get(location, "search") ?? {};
  return { ...FALLBACK_SEARCH, ...search };
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
  const { sort } = get(location, "sort") ?? {};
  return sort ?? FALLBACK_SORT;
}

export function setSort({
  column_name,
  ...location
}: Location & { column_name: string }) {
  const cur = getSort(location);
  let is_descending =
    cur == null || column_name != cur.column_name ? false : !cur?.is_descending;
  set({ ...location, config: { sort: { column_name, is_descending } } });

  // we ONLY trigger an update when the change is on this client, rather than
  // listening for changes on kv. The reason is because changing a sort order
  // on device causing it to change on another could be annoying...
  redux
    .getProjectActions(location.project_id)
    .setState({ active_file_sort: Math.random() });
}
