/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Drag tasks handle (and other support)
*/

import { Icon, Tip } from "../../components";
import { useSortable } from "@dnd-kit/sortable";

interface Props {
  id: string;
}

function EnabledDragHandle({ id }: Props) {
  const { attributes, listeners } = useSortable({ id });
  return (
    <Icon
      style={{ cursor: "pointer" }}
      name="bars"
      {...attributes}
      {...listeners}
    />
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
