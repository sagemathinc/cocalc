import type { FilesystemState, FilesystemStatePatch } from "./types";

export function makePatch(
  s0: FilesystemState,
  s1: FilesystemState,
): FilesystemStatePatch {
  const patch: FilesystemStatePatch = {};
  for (const path in s1) {
    const n = s1[path];
    if (s0[path] !== n) {
      patch[path] = n;
    }
  }
  for (const path in s0) {
    if (s1[path] === undefined) {
      patch[path] = null;
    }
  }
  return patch;
}

export function applyPatch(s: FilesystemState, patch: FilesystemStatePatch) {
  const t = { ...s };
  for (const path in patch) {
    const v = patch[path];
    if (v == null) {
      delete t[path];
    } else {
      t[path] = v;
    }
  }
  return t;
}
