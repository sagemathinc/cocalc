import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Checkbox } from "antd";
import { Element } from "../../types";
import { useFrameContext } from "../../hooks";
import { run } from "./run";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function CodeControlBar({ element }: Props) {
  const { actions, project_id, path } = useFrameContext();
  return (
    <div
      style={{
        marginTop: "5px",
        padding: "2px 5px",
        border: "1px solid #ccc",
        borderRadius: "3px",
        background: "white",
        display: "inline-block",
        float: "right",
        boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
      }}
    >
      {/*<Checkbox
        checked={!element.data?.hideOutput}
        style={{ fontWeight: 250 }}
        onChange={(e) =>
          actions.setElementData(element, { hideOutput: !e.target.checked })
        }
      >
        Output
      </Checkbox>*/}
      <Button
        onClick={() => {
          run({
            project_id,
            path,
            input: element.str ?? "",
            id: element.id,
            set: (obj) => actions.setElementData(element, obj),
          });
        }}
      >
        <Icon name="play" /> Run
      </Button>
      <Button onClick={() => console.log("interrupt code")}>
        <Icon name="stop" /> Interrupt
      </Button>
      <Checkbox
        checked={!element.data?.hideInput}
        style={{ fontWeight: 250, marginLeft: "10px" }}
        onChange={(e) => {
          actions.setElementData(element, { hideInput: !e.target.checked });
        }}
      >
        Input
      </Checkbox>
    </div>
  );
}
