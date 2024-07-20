/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LocalViewStateMap } from "./types";

export function get_search(
  local_view_state: LocalViewStateMap,
  relevant_tags: { [tag: string]: true }
): string {
  let search = "";
  local_view_state
    .get("selected_hashtags")
    ?.forEach(function (state: -1 | 1, tag: string): void {
      if (!relevant_tags[tag]) {
        return;
      }
      if (state === 1) {
        search += " #" + tag + " ";
      } else if (state === -1) {
        search += " -#" + tag + " ";
      }
    });
  return search + " " + (local_view_state.get("search") ?? "");
}
