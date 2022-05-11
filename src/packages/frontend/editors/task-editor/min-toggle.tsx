/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Toggle to minimize display of a task (just show first part or everything)
*/

import { CSS, React } from "../../app-framework";
import { Icon } from "../../components";
import { TaskActions } from "./actions";

const STYLE: CSS = { fontSize: "17pt", color: "#888", float: "right" } as const;

interface Props {
  actions?: TaskActions;
  task_id: string;
  hideBody?: boolean;
  has_body: boolean;
}

export const MinToggle: React.FC<Props> = React.memo(
  ({ actions, task_id, hideBody, has_body }) => {
    if (actions == null) {
      // no support for toggling (e.g., read-only history view)
      return <span />;
    }
    if (has_body) {
      return (
        <span
          onClick={() => {
            actions.toggleHideBody(task_id);
          }}
          style={STYLE}
        >
          {has_body ? (
            <Icon name={hideBody ? "caret-right" : "caret-down"} />
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
