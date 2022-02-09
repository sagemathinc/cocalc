import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";
import { Button, Checkbox } from "antd";
import { useFrameContext } from "../hooks";
//import { redux } from "@cocalc/frontend/app-framework";
//import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
//import { aux_file } from "@cocalc/util/misc";
/*
  const { project_id, path } = useFrameContext();
  const aux_path = aux_file(path, "ipynb");
  const actions = redux.getEditorActions(project_id, aux_path) as
    | JupyterEditorActions
    | undefined;
  if (actions == null) {
    return <div>TODO</div>;
  }
  const store = actions.jupyter_actions.store;
  const id = element.str ?? "todo";
  const cell = store.get("cells").get(id);
  if (cell == null) {
    return <div>Create cell '{id}'</div>;
  }
  const cm_options = store.get("cm_options");
  const style = {
    fontSize: `${element.data?.fontSize}px`,
    borderLeft: element.data?.color
      ? `5px solid ${element.data?.color}`
      : undefined,
  };

  return (
    <div style={style}>
      <Cell
        cell={cell}
        cm_options={cm_options}
        mode="edit"
        font_size={element.data?.fontSize ?? 14}
        project_id={project_id}
      />
    </div>
  );

  */
interface Props {
  element: Element;
  focused?: boolean;
}

export default function CodeControlBar({ element }: Props) {
  const { actions } = useFrameContext();
  return (
    <div
      style={{
        marginTop: "10px",
        padding: "2px 5px",
        border: "1px solid #ccc",
        borderRadius: "3px",
        background: "white",
        display: "inline-block",
        float: "right",
        boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
      }}
    >
      <Checkbox
        checked={!element.data?.hideInput}
        style={{ fontWeight: 250 }}
        onChange={(e) => {
          actions.setElementData(element, { hideInput: !e.target.checked });
        }}
      >
        Input
      </Checkbox>
      <Checkbox
        checked={!element.data?.hideOutput}
        style={{ fontWeight: 250 }}
        onChange={(e) =>
          actions.setElementData(element, { hideOutput: !e.target.checked })
        }
      >
        Output
      </Checkbox>
      <Button onClick={() => console.log("run code", element.str)}>
        <Icon name="play" /> Run
      </Button>
      <Button onClick={() => console.log("interrupt code")}>
        <Icon name="stop" /> Interrupt
      </Button>
    </div>
  );
}
