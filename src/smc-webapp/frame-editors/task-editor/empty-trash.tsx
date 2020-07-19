/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Button to empty the trash, thus "permanently" deleting all deleted tasks.
*/

import { React } from "../../app-framework";
import { Button } from "../../antd-bootstrap";
import { TaskActions } from "./types";

interface Props {
  actions?: TaskActions;
  count: number;
}

export const EmptyTrash: React.FC<Props> = React.memo(({ actions, count }) => {
  if (actions == null) {
    return <span />;
  }

  return (
    <Button
      bsStyle="danger"
      onClick={() => {
        actions.stop_showing_deleted();
        actions.empty_trash();
      }}
      disabled={count === 0}
    >
      Empty Trash ({count})
    </Button>
  );
});
