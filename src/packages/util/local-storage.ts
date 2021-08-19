/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// TODO: Move this var and the `delete_local_storage` to a new front-end-misc or something
// TS rightfully complains about this missing when built on back end systems
declare var localStorage;

// Wrapper around localStorage, so we can safely touch it without raising an
// exception if it is banned (like in some browser modes) or doesn't exist.
// See https://github.com/sagemathinc/cocalc/issues/237

export function set_local_storage(key: string, val: string): void {
  try {
    localStorage[key] = val;
  } catch (e) {
    console.warn(`localStorage set error -- ${e}`);
  }
}

export function get_local_storage(key: string): string | undefined {
  try {
    return localStorage[key];
  } catch (e) {
    console.warn(`localStorage get error -- ${e}`);
    return undefined;
  }
}

/**
 * Deletes key from local storage
 * FRONT END ONLY
 */

export function delete_local_storage(key: string): void {
  try {
    delete localStorage[key];
  } catch (e) {
    console.warn(`localStorage delete error -- ${e}`);
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
