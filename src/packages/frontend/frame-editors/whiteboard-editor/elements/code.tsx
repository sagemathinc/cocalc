//import { useEffect, useState } from "react";
//import { Input } from "antd";
//import { Markdown } from "@cocalc/frontend/components";

//import { useFrameContext } from "../hooks";
import { Element } from "../types";
//import { Cell } from "@cocalc/frontend/jupyter/cell";
//import { redux } from "@cocalc/frontend/app-framework";
//import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
//import { aux_file } from "@cocalc/util/misc";
import { fromJS, Map } from "immutable";

import { CodeMirrorEditor } from "@cocalc/frontend/jupyter/codemirror-editor";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Code({ element, focused }: Props) {
  focused = focused;
  const actions = {
    select_complete: (
      id: string,
      item: string,
      complete?: Map<string, any>
    ) => {},
    complete_handle_key: (_: string, keyCode: number) => {},
    clear_complete: () => {},
    set_cursor_locs: (locs: any[], side_effect?: boolean) => {},
    set_cell_input: (id: string, input: string, save?: boolean) => {},
    undo: () => {},
    redo: () => {},
    in_undo_mode: () => {
      return false;
    },
    is_introspecting: () => {
      return false;
    },
    introspect_close: () => {},
    introspect_at_pos: (
      code: string,
      level: 0 | 1,
      pos: { ch: number; line: number }
    ): Promise<void> => {},
    complete: (
      code: string,
      pos?: { line: number; ch: number } | number,
      id?: string,
      offset?: any
    ): Promise<boolean> => {
      return false;
    },
    save: (): Promise<void> => {},
  };

  return (
    <CodeMirrorEditor
      actions={actions}
      id={""}
      options={fromJS({})}
      value={element.str ?? ""}
    />
  );

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

  /*
  const [value, setValue] = useState<string>(element.str ?? "");
  const frame = useFrameContext();

  const style = {
    fontSize: element.data?.fontSize,
    border: element.data?.color
      ? `2px solid ${element.data?.color}`
      : undefined,
  };

  if (!focused) {
    const val =
      "```py\n" + (element.str?.trim() ? element.str : "Type code") + "\n```";
    return (
      <div style={style}>
        <Markdown
          value={val}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    );
  }

  useEffect(() => {
    // should be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);

  return (
    <Input.TextArea
      style={style}
      className="nodrag"
      placeholder="Type code"
      autoFocus
      value={value}
      rows={4}
      onChange={(e) => {
        // TODO: need to also save changes (like with onBlur below), but debounced.
        setValue(e.target.value);
      }}
      onBlur={() => {
        frame.actions.setElement({ id: element.id, str: value });
      }}
    />
  );*/
}
