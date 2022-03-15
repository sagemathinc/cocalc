/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Checkbox for toggling done status
*/

import { React, CSS } from "../../app-framework";
import { Icon } from "../../components";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  done: boolean;
  read_only: boolean;
  task_id: string;
}

const STYLE: CSS = {
  fontSize: "17pt",
  color: "#888",
  width: "40px",
  padding: "0 10px",
} as const;

export const DoneCheckbox: React.FC<Props> = React.memo(
  ({ done, read_only, task_id, actions }) => {
    return (
      <span
        onClick={() => {
          if (read_only || actions == null) return;
          if (done) {
            actions.set_task_not_done(task_id);
          } else {
            actions.set_task_done(task_id);
          }
        }}
        style={STYLE}
      >
        <Icon name={done ? "check-square-o" : "square-o"} />
      </span>
    );
  }
);
