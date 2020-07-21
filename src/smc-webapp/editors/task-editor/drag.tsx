/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Drag tasks handle (and other support)
*/
import { React } from "../../app-framework";
import { Icon, Tip } from "../../r_misc";
import { SortableHandle } from "react-sortable-hoc";

const HandleIcon: React.FC = () => {
  return <Icon style={{ cursor: "pointer" }} name="reorder" />;
};

const SortableDragHandle = SortableHandle(HandleIcon);

const DisabledDragHandle: React.FC = () => {
  return (
    <Tip
      title={"Select Custom Order to enable dragging tasks."}
      delayShow={700}
    >
      <HandleIcon />
    </Tip>
  );
};

interface Props {
  sortable?: boolean;
}

export const DragHandle: React.FC<Props> = ({ sortable }) => {
  let color, Handle;
  if (sortable) {
    color = "#888";
    Handle = SortableDragHandle;
  } else {
    color = "#eee";
    Handle = DisabledDragHandle;
  }
  return (
    <span style={{ fontSize: "17pt", color, marginLeft: "15px" }}>
      <Handle />
    </span>
  );
};
