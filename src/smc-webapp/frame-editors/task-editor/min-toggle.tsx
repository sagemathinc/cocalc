/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Toggle to minimize display of a task (just show first part or everything)
*/

import { CSS, React } from "../../app-framework";
import { Icon } from "../../r_misc";
import { TaskActions } from "./types";

const STYLE: CSS = { fontSize: "17pt", color: "#888", float: "right" } as const;

interface Props {
  actions?: TaskActions;
  task_id: string;
  full_desc: boolean;
  has_body: boolean;
}

export const MinToggle: React.FC<Props> = React.memo(
  ({ actions, task_id, full_desc, has_body }) => {
    if (actions == null) {
      // no support for toggling (e.g., read-only history view)
      return <span />;
    }
    if (has_body) {
      return (
        <span
          onClick={() => {
            actions.toggle_full_desc(task_id);
          }}
          style={STYLE}
        >
          {has_body ? (
            <Icon name={full_desc ? "caret-down" : "caret-right"} />
          ) : (
            <Icon name={"caret-right"} />
          )}
        </span>
      );
    } else {
      return <span />;
    }
  }
);
