import { Button, Tooltip } from "antd";
import { Element } from "../types";
import { Icon } from "@cocalc/frontend/components/icon";
import { BUTTON_STYLE } from "./edit-bar";
import { useFrameContext } from "../hooks";

interface Props {
  elements: Element[];
}

export default function HideButton({ elements }: Props) {
  const { id: frameId, actions } = useFrameContext();
  let hidden = isHidden(elements);
  return (
    <Tooltip
      placement="bottom"
      title={`${hidden ? "Show" : "Hide"} selected objects`}
    >
      <Button
        style={BUTTON_STYLE}
        onClick={() => {
          if (hidden) {
            actions.unhideElements(elements);
          } else {
            actions.hideElements(elements);
          }
          actions.clearSelection(frameId);
        }}
      >
        <Icon name={hidden ? "eye-slash" : "eye"} />
      </Button>
    </Tooltip>
  );
}

// Return true if any of the elements are hidden.
export function isHidden(elements: Element[]): boolean {
  for (const element of elements) {
    if (element.hide != null) {
      return true;
    }
  }
  return false;
}
