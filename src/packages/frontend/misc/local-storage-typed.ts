/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * Typed wrapper around LocalStorage
 */

// tests at startup if localStorage exists and works. if not or disabled, uses memory as a fallback.

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { LS } from "./local-storage";

if (!LS.localStorageIsAvailable()) {
  console.warn(`Local Storage not available -- using memory fallback`);
  window["cocalc_LS_memory"] = LS.getLocalStorage();
}

export class CustomKey {
  constructor(private key: string) {}
  getKey() {
    return this.key;
  }
}

type Keys = string[] | string | CustomKey;

function make_key(keys: Keys): string {
  if (keys instanceof CustomKey) {
    return keys.getKey();
  } else {
    const key = typeof keys == "string" ? keys : keys.join(".");
    return [appBasePath, key].join("::");
  }
}

// returns the deleted value or undefined in case of a problem
export function del<T>(keys: Keys): T | undefined {
  const key = make_key(keys);
  try {
    const val = get<T>(keys);
    LS.delete(key);
    return val;
  } catch (e) {
    console.warn(`localStorage delete("${key}"): ${e}`);
  }
}

// set an entry, and return true if it was successful
export function set<T>(keys: Keys, value: T): boolean {
  const key = make_key(keys);
  try {
    LS.set(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`localStorage set("${key}"): ${e}`);
    return false;
  }
}

export function get<T>(keys: Keys): T | undefined {
  const key = make_key(keys);
  try {
    const val = LS.get(key);
    if (val != null) {
      if (typeof val === "string") {
        return JSON.parse(val);
      } else {
        return val as unknown as T;
      }
    } else {
      return undefined;
    }
  } catch (e) {
    console.warn(`localStorage get("${key}"): ${e}`);
    del<T>(key);
  }
}

export function exists(keys: Keys): boolean {
  const key = make_key(keys);
  return LS.get(key) !== null;
}
