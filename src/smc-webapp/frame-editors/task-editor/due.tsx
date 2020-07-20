/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task due date
  - displays due date
  - allows for changing it
*/

import { React, CSS } from "../../app-framework";
import { DateTimePicker, Icon, Space, TimeAgo } from "../../r_misc";
import { TaskActions } from "./actions";

const STYLE: CSS = {
  zIndex: 1,
  position: "absolute",
  border: "1px solid lightgrey",
  background: "white",
  borderRadius: "4px",
  margin: "-20px 0 0 -150px", // we use a negative margin to adjust absolute position of calendar popover (hackish)
  boxShadow: "0 6px 12px rgba(0,0,0,.175)",
} as const;

interface Props {
  actions: TaskActions;
  task_id: string;
  due_date?: number;
  editing?: boolean;
  read_only?: boolean;
  is_done?: boolean; // do not show due date in red if task already done.
}

export const DueDate: React.FC<Props> = React.memo(
  ({ actions, task_id, due_date, editing, read_only, is_done }) => {
    function stop_editing() {
      actions.stop_editing_due_date(task_id);
      actions.enable_key_handler();
    }

    function edit() {
      actions.edit_due_date(task_id);
    }

    function set_due_date(date) {
      actions.set_due_date(task_id, date);
      if (!date) {
        stop_editing();
      }
    }

    function render_calendar() {
      let value;
      if (!editing) {
        return;
      }
      if (due_date) {
        value = new Date(due_date);
      } else {
        value = new Date();
      }
      return (
        <div style={STYLE}>
          <DateTimePicker
            value={value}
            open={true}
            placeholder={"Set Task Due Date"}
            onChange={(date) => set_due_date(date - 0)}
            onFocus={actions.disable_key_handler}
            onBlur={stop_editing}
          />
        </div>
      );
    }

    function render_remove_due_date() {
      if (!due_date) {
        return;
      }
      return (
        <span style={{ color: "#888" }}>
          <Space />
          <Icon
            name="times"
            onClick={() => {
              set_due_date(null);
              actions.stop_editing_due_date(task_id);
            }}
          />
        </span>
      );
    }

    function render_due_date() {
      let elt;
      let style = undefined;
      if (due_date) {
        const date = new Date(due_date);
        if (date <= new Date() && !is_done) {
          style = { color: "white", backgroundColor: "red", padding: "3px" };
        }
        elt = <TimeAgo date={new Date(due_date)} />;
      } else {
        elt = <span>none</span>;
      }
      return (
        <span onClick={!read_only ? edit : undefined} style={style}>
          {elt}
        </span>
      );
    }

    if (read_only) {
      return render_due_date();
    } else {
      return (
        <div style={{ cursor: "pointer" }}>
          {render_due_date()}
          {render_remove_due_date()}
          {render_calendar()}
        </div>
      );
    }
  }
);
