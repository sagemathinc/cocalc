/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Drag tasks handle (and other support)
*/

import { Icon, Tip } from "../../components";
import { DragHandle as SortableDragHandle } from "@cocalc/frontend/components/sortable-list";

interface Props {
  id: string;
}

function EnabledDragHandle({ id }: Props) {
  return (
    <SortableDragHandle id={id}>
      <Icon name="bars" />
    </SortableDragHandle>
  );
}

function DisabledDragHandle({}: Props) {
  return (
    <Tip
      title={"Select Custom Order to enable dragging tasks."}
      delayShow={700}
    >
      <Icon style={{ cursor: "pointer" }} name="bars" />
    </Tip>
  );
}

interface Props {
  sortable?: boolean;
}

export const DragHandle: React.FC<Props> = ({ id, sortable }) => {
  let color, Handle;
  if (sortable) {
    color = "#888";
    Handle = EnabledDragHandle;
  } else {
    color = "#eee";
    Handle = DisabledDragHandle;
  }
  return (
    <span style={{ fontSize: "17pt", color, marginLeft: "15px" }}>
      <Handle id={id} />
    </span>
  );
};
