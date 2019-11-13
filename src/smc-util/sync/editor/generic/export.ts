import { SortedPatchList } from "./sorted-patch-list";
import { Patch } from "./types";

export interface HistoryEntry {
  time_utc: Date;
  account_id: string;
  patch?: any[];
  patch_length?: number;
}

export interface HistoryExportOptions {
  patches?: boolean;
  patch_lengths?: boolean; // length of each patch (some measure of amount changed)
}

export function export_history(
  account_ids: string[],
  patch_list: SortedPatchList,
  options: HistoryExportOptions
): HistoryEntry[] {
  const patches: Patch[] = patch_list.export();
  const entries: HistoryEntry[] = [];
  for (const x of patches) {
    const time_utc = x.time;
    let account_id = account_ids[x.user_id];
    if (account_id == null) {
      account_id = "unknown"; // should never happen...
    }
    const entry: HistoryEntry = { time_utc, account_id };
    if (options.patches) {
      entry.patch = x.patch;
    }
    if (options.patch_lengths) {
      entry.patch_length = JSON.stringify(x.patch).length;
    }
    entries.push(entry);
  }
  return entries;
}
