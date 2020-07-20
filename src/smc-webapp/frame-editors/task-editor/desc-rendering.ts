/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Utility/parsing functions used in rendering task description.
*/

import { replace_all_function, parse_hashtags } from "smc-util/misc";
import { apply_without_math } from "smc-util/mathjax-utils-2";
import { SelectedHashtags } from "./types";

// Make clever use of replace_all_function to toggle the state of a checkbox.
export function toggle_checkbox(s, index, checked): string {
  // Find the index'd checkbox and change the state to not checked.
  let cur, next;
  if (checked) {
    cur = "[x]";
    next = "[ ]";
  } else {
    cur = "[ ]";
    next = "[x]";
  }

  return apply_without_math(s, (x) =>
    replace_all_function(x, cur, function (i) {
      if (i === index) {
        return next;
      } else {
        return cur;
      }
    })
  );
}

// assumes value is the text output by remove_math!
export function process_hashtags(
  value: string,
  selected_hashtags: SelectedHashtags
): string {
  // replace hashtags by a span with appropriate class
  const v = parse_hashtags(value);
  if (v.length === 0) {
    return value;
  }
  // replace hashtags by something that renders nicely in markdown (instead of as descs)
  let x0 = [0, 0];
  let value0 = "";
  for (let x of v) {
    const hashtag = value.slice(x[0] + 1, x[1]);
    const state =
      selected_hashtags != null ? selected_hashtags.get(hashtag) : undefined;
    let cls = "webapp-tasks-hash";
    if (state === 1) {
      cls += "-selected";
    } else if (state === -1) {
      cls += "-negated";
    }
    value0 +=
      value.slice(x0[1], x[0]) +
      `<span class='${cls}' data-hashtag='${hashtag}' data-state='${state}'>#` +
      hashtag +
      "</span>";
    x0 = x;
  }
  return value0 + value.slice(x0[1]);
}

// assumes value is the text output by remove_math!
export function process_checkboxes(value) {
  value = replace_all_function(
    value,
    "[ ]",
    (index) =>
      `<i class='fa fa-square-o'       data-index='${index}' data-checkbox='false'></i>`
  );
  value = replace_all_function(
    value,
    "[x]",
    (index) =>
      `<i class='fa fa-check-square-o' data-index='${index}' data-checkbox='true'></i>`
  );
  return value;
}

export function header_part(s) {
  const lines = s.trim().split("\n");
  for (
    let i = 0, end = lines.length, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    if (lines[i].trim() === "") {
      if (i === lines.length - 1) {
        return s;
      } else {
        return lines.slice(0, i).join("\n");
      }
    }
  }
  return s;
}
