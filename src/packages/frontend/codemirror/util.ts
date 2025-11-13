import { set, get, del } from "@cocalc/frontend/misc/local-storage-typed";
import { isEqual } from "lodash";

export function getFoldedLines(cm): number[] {
  if (cm?.foldCode == null) {
    // not enabled
    return [];
  }
  return cm
    .getAllMarks()
    .filter((mark) => mark.__isFold)
    .map((mark) => mark.find().from.line);
}

export function setFoldedLines(cm, lines: number[]) {
  if (cm?.foldCode == null) {
    // not enabled
    return;
  }
  lines.reverse();
  for (const n of lines) {
    cm.foldCode(n);
  }
}

function toKey(key: string): string {
  return `cmfold-${key}`;
}

export function initFold(cm, key: string) {
  const k = toKey(key);
  const lines = get<number[]>(k);
  if (lines != null) {
    try {
      setFoldedLines(cm, lines);
    } catch (err) {
      console.warn(`error setting cold folding for ${key}: `, err);
      del(k);
    }
  }
}

export function saveFold(cm, key: string) {
  const k = toKey(key);
  const lines = get<number[]>(k);
  const lines2 = getFoldedLines(cm);
  if (lines2.length == 0) {
    if (lines != null) {
      del(k);
    }
    return;
  }
  if (!isEqual(lines, lines2)) {
    set<number[]>(k, lines2);
  }
}
