//import { useEffect, useState } from "react";
//import { Input } from "antd";
//import { Markdown } from "@cocalc/frontend/components";

import { useFrameContext } from "../hooks";
import { Element } from "../types";
//import { Cell } from "@cocalc/frontend/jupyter/cell";
//import { redux } from "@cocalc/frontend/app-framework";
//import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
//import { aux_file } from "@cocalc/util/misc";
import { fromJS, Map } from "immutable";
import { cm_options } from "@cocalc/frontend/jupyter/cm_options";

import { CodeMirrorEditor } from "@cocalc/frontend/jupyter/codemirror-editor";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Code({ element, focused }: Props) {
  const frame = useFrameContext();
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
    set_cell_input: (id: string, input: string, save?: boolean) => {
      frame.actions.setElement({ id: element.id, str: input }, save);
    },
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

  const style = {
    fontSize: element.data?.fontSize,
    border: `${2 * (element.data?.radius ?? 1)}px solid ${
      element.data?.color ?? "#ccc"
    }`,
    borderRadius: "5px",
    padding: "5px",
    background: "white",
    is_focused: focused,
  };

  return (
    <div className={focused ? "nodrag" : undefined}>
      <CodeMirrorEditor
        actions={actions}
        id={""}
        options={getCMOptions()}
        value={element.str ?? ""}
        style={style}
      />
    </div>
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

}

import { redux } from "@cocalc/frontend/app-framework";
function getCMOptions() {
  const mode = "python";
  const account = redux.getStore("account");
  const immutable_editor_settings = account?.get("editor_settings");
  const editor_settings = immutable_editor_settings?.toJS() ?? {};
  const line_numbers =
    immutable_editor_settings?.get("jupyter_line_numbers") ?? false;
  return fromJS(cm_options(mode, editor_settings, line_numbers, false));
}
