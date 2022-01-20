/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_valid_uuid_string } from "@cocalc/util/misc";

// TODO: Move this var and the `delete_local_storage` to a new front-end-misc or something
// TS rightfully complains about this missing when built on back end systems
declare var localStorage;

const RECENTLY_KEY = "__recent";
const RECENTLY_KEEP = 50; // tradeoff: keys need storage as well
const RECENTLY_DELIM = "\0";

// Wrapper around localStorage, so we can safely touch it without raising an
// exception if it is banned (like in some browser modes) or doesn't exist.
// See https://github.com/sagemathinc/cocalc/issues/237

export function set_local_storage(key: string, val: string): void {
  if (key === RECENTLY_KEY) {
    throw new Error(`localStorage: Key "${RECENTLY_KEY}" is used internally.`);
  }
  if (key.indexOf(RECENTLY_DELIM) != -1) {
    throw new Error(
      `localStorage: Cannot use ${RECENTLY_DELIM} as a character in a key`
    );
  }
  try {
    localStorage[key] = val;
  } catch (e) {
    if (!trim_local_storage(key, val)) {
      console.warn(`localStorage: set error -- ${e}`);
    }
  }
  record_usage(key);
}

function get_recent_usage(): string[] {
  try {
    return localStorage[RECENTLY_KEY].split(RECENTLY_DELIM);
  } catch {
    return [];
  }
}

// to avoid trimming more useful entries, we keep an array of recently modified keys
function record_usage(key: string) {
  try {
    let keys: string[] = get_recent_usage();
    // first, only keep most recent entries
    keys = keys.slice(0, RECENTLY_KEEP);
    // if the key already exists, remove it
    keys = keys.filter((el) => el !== key);
    // finally, insert the current key at the beginning
    keys.unshift(key);
    const new_recent_usage = keys.join(RECENTLY_DELIM);
    try {
      localStorage[RECENTLY_KEY] = new_recent_usage;
    } catch {
      trim_local_storage(RECENTLY_KEY, new_recent_usage);
    }
  } catch (e) {
    console.warn(`localStorage: unable to record usage of '${key}' -- ${e}`);
  }
}

function delete_usage(key: string) {
  try {
    let keys: string[] = get_recent_usage();
    // we only keep those keys, which are different from the one we removed
    keys = keys.filter((el) => el !== key);
    localStorage[RECENTLY_KEY] = keys.join(RECENTLY_DELIM);
  } catch (e) {
    console.warn(`localStorage: unable to delete usage of '${key}' -- ${e}`);
  }
}

// In case there is an error upon storing a value, we assume we hit the quota limit.
// Try a couple of times to delete some entries and saving the key/value pair.
function trim_local_storage(key: string, val: string): boolean {
  // we try up to 10 times to remove a couple of key/values
  for (let i = 0; i < 10; i++) {
    do_the_trim();
    try {
      localStorage[key] = val;
      // no error means we were able to set the value
      console.warn(`localStorage: trimming a few entries worked`);
      return true;
    } catch (e) {}
  }
  console.warn(`localStorage: trimming did not help`);
  return false;
}

// delete a few keys (not recently used and only of a specific type).
function do_the_trim() {
  if (local_storage_length() == 0) return;
  // delete a maximum of 10 entries
  let num = Math.min(local_storage_length(), 10);
  const keys = Object.keys(localStorage);
  // only get recent once, more efficient
  const recent = get_recent_usage();
  // attempt deleting those entries up to 20 times
  for (let i = 0; i < 20; i++) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (is_trim_candidate(k, recent)) {
      // do not call delete_local_storage, could cause a recursion
      try {
        delete localStorage[k];
      } catch (e) {
        console.warn(`localStorage: trimming/delete does not work`);
        return;
      }
      num -= 1;
      if (num < 0) return;
    }
  }
}

/* candidate keys are like
- jupyter-editor-09eb3907-0680-4674-8a47-e510e56ec22e-inhalt-2021-10/...
- editor-09eb3907-0680-4674-8a47-e510e56ec22e-local/work...
- 09eb3907-0680-4674-8a47-e510e56ec22e/uw...
- and they're also not recently modified
*/
function is_trim_candidate(key: string, recent: string[]): boolean {
  if (get_local_storage(key) == null) return false;
  if (recent.includes(key)) return false;
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

export function get_local_storage(key: string): string | undefined {
  try {
    record_usage(key);
    return localStorage[key];
  } catch (e) {
    console.warn(`localStorage: get error -- ${e}`);
    return undefined;
  }
}

/**
 * Deletes key from local storage
 * FRONT END ONLY
 */

export function delete_local_storage(key: string): void {
  try {
    delete_usage(key);
    delete localStorage[key];
  } catch (e) {
    console.warn(`localStorage: delete error -- ${e}`);
  }
}

export function has_local_storage(): boolean {
  try {
    const TEST = "__smc_test__";
    localStorage[TEST] = "x";
    delete localStorage[TEST];
    return true;
  } catch (e) {
    return false;
  }
}

export function local_storage_length(): number {
  try {
    return localStorage.length;
  } catch (e) {
    return 0;
  }
}
