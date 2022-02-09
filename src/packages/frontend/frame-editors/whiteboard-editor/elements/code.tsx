import { CSSProperties } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { fromJS, Map } from "immutable";
import { cm_options } from "@cocalc/frontend/jupyter/cm_options";
//import { Icon } from "@cocalc/frontend/components/icon";

import { CodeMirrorEditor } from "@cocalc/frontend/jupyter/codemirror-editor";

import CodeControlBar from "./code-control";

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
    ) => {
      id = id;
      item = item;
      complete = complete;
    },
    complete_handle_key: (_: string, keyCode: number) => {
      keyCode = keyCode;
    },
    clear_complete: () => {},
    set_cursor_locs: (locs: any[], side_effect?: boolean) => {
      locs = locs;
      side_effect = side_effect;
    },
    set_cell_input: (id: string, input: string, save?: boolean) => {
      id = id;
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
    ): Promise<void> => {
      code = code;
      level = level;
      pos = pos;
      return (async () => {})();
    },
    complete: (
      code: string,
      pos?: { line: number; ch: number } | number,
      id?: string,
      offset?: any
    ): Promise<boolean> => {
      code = code;
      pos = pos;
      id = id;
      offset = offset;
      return (async () => {
        return false;
      })();
    },
    save: (): Promise<void> => {
      return (async () => {})();
    },
  };

  const style = {
    fontSize: element.data?.fontSize,
    border: `${2 * (element.data?.radius ?? 1)}px solid ${
      element.data?.color ?? "#ccc"
    }`,
    borderRadius: "5px",
    padding: "5px",
    background: "white",
  } as CSSProperties;

  const { hideInput, hideOutput } = element.data ?? {};

  return (
    <div className={focused ? "nodrag" : undefined} style={style}>
      {!hideInput && (
        <CodeMirrorEditor
          actions={actions}
          id={""}
          options={getCMOptions()}
          value={element.str ?? ""}
          is_focused={focused}
        />
      )}
      {/* hideInput && (hideOutput || !element.data?.output) && (
        <Icon name="jupyter" />
      )*/}
      {focused && <CodeControlBar element={element} />}
    </div>
  );
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
