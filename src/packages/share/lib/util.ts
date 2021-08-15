/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function isUUID(s: string): boolean {
  // todo: add full check.
  return typeof s == "string" && s.length == 36;
}

export function isSha1Hash(s: string): boolean {
  return typeof s == "string" && s.length == 40;
  // todo: could add full check (i.e., each character is in 0-e)
}

export function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// lower case extension of the path
export function getExtension(path: string): string {
  const v = path.split(".");
  return (v.length <= 1 ? "" : v.pop() ?? "").toLowerCase();
}

export function containingPath(path: string): string {
  const i = path.lastIndexOf("/");
  if (i != -1) {
    return path.slice(0, i);
  } else {
    return "";
  }
}
