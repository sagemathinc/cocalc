import { Button, Popconfirm } from "antd";
import { Element } from "../types";
import { Icon } from "@cocalc/frontend/components/icon";
import { BUTTON_STYLE } from "./edit-bar";
import { useFrameContext } from "../hooks";

interface Props {
  elements: Element[];
}

export default function LockButton({ elements }: Props) {
  const { actions } = useFrameContext();
  let locked = isLocked(elements);
  const click = () => {
    for (const element of elements) {
      actions.setElement({
        obj: { id: element.id, locked: !locked },
        commit: false,
        cursors: [{}],
      });
    }
    actions.syncstring_commit();
  };
  const btn = (
    <Button style={BUTTON_STYLE} onClick={!locked ? click : undefined}>
      <Icon name={`lock${!locked ? "-open" : ""}`} />
    </Button>
  );
  if (locked) {
    return (
      <Popconfirm
        title={"Unlock this?"}
        onConfirm={click}
        okText="Unlock"
        cancelText="Cancel"
      >
        {btn}
      </Popconfirm>
    );
  } else {
    return btn;
  }
}

// Return true if any of the elements are locked.
export function isLocked(elements: Element[]): boolean {
  for (const element of elements) {
    if (element.locked) {
      return true;
    }
  }
  return false;
}
