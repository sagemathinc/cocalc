import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Checkbox, Tooltip } from "antd";
import { Element } from "../../types";
import { useFrameContext } from "../../hooks";
import { getJupyterActions } from "./actions";
import { delay } from "awaiting";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function CodeControlBar({ element }: Props) {
  const { actions, project_id, path } = useFrameContext();
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
        top: 0,
        right: "5px",
        zIndex: 2,
      }}
    >
      {!element.data?.hideInput && element.data?.runState == "busy" && (
        <Tooltip title="Interrupt running computation">
          <Button
            size="small"
            onClick={async () => {
              const jupyter_actions = await getJupyterActions({
                project_id,
                path,
              });
              jupyter_actions.signal("SIGINT");
              await delay(500);
              // check if the kernel really stopped, in which case cell is definitely stopped.
              if (jupyter_actions.store.get("kernel_state") != "running") {
                actions.setElementData({
                  element,
                  obj: { runState: "done" },
                });
              }
            }}
          >
            <Icon name="stop" /> Stop
          </Button>
        </Tooltip>
      )}
      {!element.data?.hideInput && (
        <Tooltip title="Evaluate code (Shift+Enter)">
          <Button
            disabled={element.data?.runState == "busy"}
            size="small"
            onClick={() => {
              actions.runCodeElement({ id: element.id });
            }}
          >
            <Icon name="play" /> Run
          </Button>
        </Tooltip>
      )}
      <Tooltip title="Toggle display of input">
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
      </Tooltip>
      <Tooltip title="Toggle display of output">
        <Checkbox
          disabled={
            element.data?.output == null ||
            Object.keys(element.data?.output).length == 0
          }
          checked={!element.data?.hideOutput}
          style={{ fontWeight: 250, marginLeft: "10px" }}
          onChange={(e) => {
            actions.setElementData({
              element,
              obj: { hideOutput: !e.target.checked },
            });
          }}
        >
          Output
        </Checkbox>
      </Tooltip>
    </div>
  );
}
