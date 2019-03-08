import { SortedPatchList } from "./sorted-patch-list";
import { Patch } from "./types";

export interface HistoryEntry {
  time: Date;
  user: string;
  patch: any[];
}

export function export_history(
  users: string[],
  patch_list: SortedPatchList
): HistoryEntry[] {
  const patches: Patch[] = patch_list.export();
  const entries: HistoryEntry[] = [];
  for (let x of patches) {
    const time = x.time;
    let user = users[x.user_id];
    if (user == null) {
      user = "Unknown User";
    }
    const patch = x.patch;
    entries.push({ time, user, patch });
  }
  return entries;
}
