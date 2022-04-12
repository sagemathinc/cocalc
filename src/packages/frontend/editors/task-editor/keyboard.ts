/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Keyboard shortcuts
*/

import { is_sortable as is_sortable_header } from "./headings-info";

function is_sortable(actions): boolean {
  return is_sortable_header(
    actions.store.getIn(["local_view_state", "sort", "column"])
  );
}

export function create_key_handler(actions): (any) => void {
  return function (evt) {
    const read_only = !!actions.store.get("read_only");
    const mod = evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey;

    if (evt.keyCode === 70) {
      // f = global find, with our without modifiers...
      actions.focus_find_box();
      return false;
    } else if (evt.which === 40 || evt.which === 74) {
      // down
      if (mod) {
        if (is_sortable(actions)) {
          actions.move_task_delta(1);
        }
      } else {
        actions.set_current_task_delta(1);
      }
      return false;
    } else if (evt.which === 38 || evt.which === 75) {
      // up
      if (mod) {
        if (is_sortable(actions)) {
          actions.move_task_delta(-1);
        }
      } else {
        actions.set_current_task_delta(-1);
      }
      return false;
    }

    if (read_only) {
      return;
    }

    // with or without modifier
    if (evt.keyCode === 83) {
      // s = save
      actions.save();
      return false;
    } else if (evt.keyCode === 78) {
      // n
      actions.new_task();
      return false;
    }

    if (mod && evt.which === 32) {
      // space - need mod so user can space to scroll down.
      actions.toggleHideBody();
      return false;
    }
    if (!mod && (evt.which === 13 || evt.which === 73)) {
      // return (or i, like vim) = edit selected
      actions.edit_desc();
      return false;
    }
  };
}
