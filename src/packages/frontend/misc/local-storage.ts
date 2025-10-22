/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LocalStorageLRU } from "@cocalc/local-storage-lru";
import { is_valid_uuid_string } from "@cocalc/util/misc";

const RECENTLY_KEY = "__recent";
const RECENTLY_KEEP = 64; // tradeoff: keys need storage as well

// upon trimming, only remove keys which start with an UUID, or are specific to editor- or jupyter-editor-
function candidate(key: string): boolean {
  const uuidlen = 36;
  for (const prefix of ["", "editor-", "jupyter-editor-"]) {
    const i = prefix.length;
    const j = i + uuidlen;
    if (key.startsWith(prefix) && is_valid_uuid_string(key.slice(i, j))) {
      return true;
    }
  }
  return false;
}

// Wrapper around localStorage, so we can safely touch it without raising an
// exception if it is banned (like in some browser modes) or doesn't exist.
// See https://github.com/sagemathinc/cocalc/issues/237
export const LS = new LocalStorageLRU({
  recentKey: RECENTLY_KEY,
  maxSize: RECENTLY_KEEP,
  isCandidate: candidate,
  fallback: true,
});

export function set_local_storage(key: string, val: string | object): void {
  LS.set(key, val);
}

export function get_local_storage(key: string): string | object | null {
  return LS.get(key);
}

export function delete_local_storage(key: string): void {
  LS.delete(key);
}

export function exists_local_storage(key: string): boolean {
  return LS.has(key);
}

export function has_local_storage(): boolean {
  return LS.localStorageIsAvailable();
}

export function local_storage_length(): number {
  return LS.size();
}

export function delete_local_storage_prefix(prefix: string): void {
  LS.deletePrefix(prefix);
}
