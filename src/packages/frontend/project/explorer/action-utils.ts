import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";

export const ACTION_BUTTONS_DIR = [
  "download",
  "compress",
  "delete",
  "rename",
  "duplicate",
  "move",
  "copy",
  "share",
] as const;

export const ACTION_BUTTONS_FILE = [
  "download",
  "compress",
  "delete",
  "rename",
  "duplicate",
  "move",
  "copy",
  "share",
] as const;

export const ACTION_BUTTONS_MULTI = [
  "download",
  "compress",
  "delete",
  "move",
  "copy",
] as const;

const DISABLED_SNAPSHOT_ACTIONS = new Set(["move", "compress"]);

export function isDisabledSnapshots(name: string) {
  return DISABLED_SNAPSHOT_ACTIONS.has(name);
}

export function isSnapshotPath(path?: string) {
  return path == SNAPSHOTS || path?.startsWith(SNAPSHOTS + "/");
}
