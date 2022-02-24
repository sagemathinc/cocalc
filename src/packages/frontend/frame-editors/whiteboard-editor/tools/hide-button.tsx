import { Button, Popover } from "antd";
import { Element } from "../types";
import { Icon } from "@cocalc/frontend/components/icon";
import { BUTTON_STYLE } from "./edit-bar";
import { useFrameContext } from "../hooks";

interface Props {
  elements: Element[];
}

export default function HideButton({ elements }: Props) {
  const { actions } = useFrameContext();
  let hidden = isHidden(elements);
  return (
    <Popover
      placement="bottom"
      title="Hide or show"
      content={
        <div style={{ maxWidth: "300px" }}>
          Hide objects to make them invisible. In select mode you will see a
          small icon, which you can click to select and unhide the object.
        </div>
      }
    >
      <Button
        style={BUTTON_STYLE}
        onClick={() => {
          if (hidden) {
            actions.unhideElements(elements);
          } else {
            actions.hideElements(elements);
          }
        }}
      >
        <Icon name={hidden ? "eye-slash" : "eye"} />
      </Button>
    </Popover>
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
