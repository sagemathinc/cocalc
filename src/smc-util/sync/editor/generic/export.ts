import { SortedPatchList } from "./sorted-patch-list";
import { Patch } from "./types";

export interface HistoryEntry {
  time: Date;
  account_id: string;
  patch?: any[];
}

export interface HistoryExportOptions {
  patches?: boolean;
}

export function export_history(
  account_ids: string[],
  patch_list: SortedPatchList,
  options: HistoryExportOptions
): HistoryEntry[] {
  const patches: Patch[] = patch_list.export();
  const entries: HistoryEntry[] = [];
  for (let x of patches) {
    const time = x.time;
    let account_id = account_ids[x.user_id];
    if (account_id == null) {
      account_id = "unknown"; // should never happen...
    }
    if (options.patches) {
      const patch = x.patch;
      entries.push({ time, account_id, patch });
    } else {
      entries.push({ time, account_id });
    }
  }
  return entries;
}
