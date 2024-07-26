/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Button to empty the trash, thus "permanently" deleting all deleted tasks.
*/

import { React } from "../../app-framework";
import { Button, Popconfirm } from "antd";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  count: number;
}

export const EmptyTrash: React.FC<Props> = React.memo(({ actions, count }) => {
  if (actions == null) {
    return <span />;
  }

  return (
    <Popconfirm
      title="Empty the trash removing all deleted tasks?"
      onConfirm={() => {
        actions.stop_showing_deleted();
        actions.empty_trash();
      }}
    >
      <Button
        style={{ marginTop: "3px" }}
        size="small"
        danger
        disabled={count === 0}
      >
        Empty Trash ({count})
      </Button>
    </Popconfirm>
  );
});
