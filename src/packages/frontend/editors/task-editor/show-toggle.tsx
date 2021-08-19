/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Toggle whether or not to show tasks (deleted, done)
*/

import { React, useRef } from "../../app-framework";
import { Icon, Space } from "../../r_misc";
import { TaskActions } from "./actions";

interface Props {
  actions: TaskActions;
  type: "done" | "deleted";
  count: number;
  show?: boolean;
}

export const ShowToggle: React.FC<Props> = React.memo(
  ({ actions, type, count, show }) => {
    const last_call_ref = useRef<number>(0);

    function render_toggle() {
      let name;
      if (show) {
        name = "check-square-o";
      } else {
        name = "square-o";
      }
      return <Icon name={name} />;
    }

    function toggle_state() {
      // avoid accidental double clicks...
      const now = new Date().valueOf();
      if (now - last_call_ref.current <= 300) {
        return;
      }
      last_call_ref.current = now;

      if (show) {
        if (type == "done") actions.stop_showing_done();
        else if (type == "deleted") actions.stop_showing_deleted();
      } else {
        if (count === 0) {
          // do nothing
          return;
        }
        if (type == "done") actions.show_done();
        else if (type == "deleted") actions.show_deleted();
      }
    }

    const toggle = render_toggle();
    if (actions == null) {
      // no support for toggling (e.g., history view)
      return toggle;
    }
    const color = count > 0 || show ? "#666" : "#999";
    return (
      <div onClick={toggle_state} style={{ color }}>
        <span style={{ fontSize: "17pt" }}>{toggle}</span>
        <Space />
        <span>Show {type}</span>
      </div>
    );
  }
);
