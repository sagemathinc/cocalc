/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { LocalViewStateMap } from "./types";

function matches(s: string, desc: string): boolean {
  if (desc.indexOf(s) === -1) {
    return false;
  }
  if (s[0] === "#") {
    // only match hashtag at end of word (the \b), so #fo does not match #foo.
    if (desc.search(new RegExp(s + "\\b")) === -1) {
      return false;
    }
  }
  return true;
}

export function search_matches(search: string[], desc: string): boolean {
  if (search.length === 0) {
    // empty search matches everything
    return true;
  }
  if (!desc) {
    // empty desc fails ALL nontrivial searches.
    return false;
  }
  desc = desc.toLowerCase();
  for (const s of search) {
    if (s === "-") {
      // a minus by itself should just be ignored...
      return true;
    } else if (s[0] === "-") {
      // negated search
      if (matches(s.slice(1), desc)) {
        return false;
      }
    } else {
      if (!matches(s, desc)) {
        return false;
      }
    }
  }
  return true;
}

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
