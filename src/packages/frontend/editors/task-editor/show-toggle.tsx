/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Toggle whether or not to show tasks (deleted, done)
*/

import { React, useRef } from "../../app-framework";
import { TaskActions } from "./actions";
import { Checkbox } from "antd";
import { capitalize } from "@cocalc/util/misc";

interface Props {
  actions: TaskActions;
  type: "done" | "deleted";
  count: number;
  show?: boolean;
}

export const ShowToggle: React.FC<Props> = React.memo(
  ({ actions, type, count, show }) => {
    const last_call_ref = useRef<number>(0);

    function toggle_state() {
      // avoid accidental double clicks...
      const now = Date.now();
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

    if (actions == null) {
      // no support for toggling (e.g., history view)
      return null;
    }
    const color = count > 0 || show ? "#666" : "#999";
    return (
      <div onClick={toggle_state} style={{ margin: "5px 0 0 15px" }}>
        <Checkbox
          checked={show}
          onClick={toggle_state}
          style={{ fontWeight: 350, color }}
        >
          {capitalize(type)}
        </Checkbox>
      </div>
    );
  }
);
