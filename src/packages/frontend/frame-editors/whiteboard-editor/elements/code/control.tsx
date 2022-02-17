import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Checkbox } from "antd";
import { Element } from "../../types";
import { useFrameContext } from "../../hooks";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function CodeControlBar({ element }: Props) {
  const { actions } = useFrameContext();
  return (
    <div
      style={{
        padding: "2px 5px",
        border: "1px solid #ccc",
        borderRadius: "3px",
        background: "white",
        display: "inline-block",
        boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
        position: "absolute",
        bottom: "5px",
        right: "5px",
        zIndex: 2,
      }}
    >
      <Button
        onClick={() => {
          actions.runCodeElement({ id: element.id });
        }}
      >
        <Icon name="play" /> Run
      </Button>
      <Checkbox
        checked={!element.data?.hideInput}
        style={{ fontWeight: 250, marginLeft: "10px" }}
        onChange={(e) => {
          actions.setElementData({
            element,
            obj: { hideInput: !e.target.checked },
          });
        }}
      >
        Input
      </Checkbox>
    </div>
  );
}
