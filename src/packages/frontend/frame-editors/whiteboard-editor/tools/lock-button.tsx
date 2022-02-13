import { Button } from "antd";
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
  return (
    <Button
      style={BUTTON_STYLE}
      onClick={() => {
        for (const element of elements) {
          actions.setElement({ id: element.id, locked: !locked }, false);
        }
        actions.syncstring_commit();
      }}
    >
      <Icon name={`lock${!locked ? "-open" : ""}`} />
    </Button>
  );
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
