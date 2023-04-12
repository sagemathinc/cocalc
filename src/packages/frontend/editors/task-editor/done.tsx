/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Checkbox for toggling done status
*/

import { Checkbox, Tooltip } from "antd";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  done: boolean;
  read_only?: boolean;
  task_id: string;
}

export function DoneCheckbox({ done, read_only, task_id, actions }: Props) {
  return (
    <Tooltip title={done ? "This task is done" : "Mark this task done"}>
      <Checkbox
        onChange={() => {
          if (read_only || actions == null) return;
          if (done) {
            actions.set_task_not_done(task_id);
          } else {
            actions.set_task_done(task_id);
          }
        }}
        checked={done}
      ></Checkbox>
    </Tooltip>
  );
}
