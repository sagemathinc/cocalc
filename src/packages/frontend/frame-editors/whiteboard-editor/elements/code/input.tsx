import { useFrameContext } from "../../hooks";
import { Element } from "../../types";
import { fromJS, Map } from "immutable";
import { cm_options } from "@cocalc/frontend/jupyter/cm_options";
import { CodeMirrorEditor } from "@cocalc/frontend/jupyter/codemirror-editor";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Input({ element, focused, canvasScale }: Props) {
  const frame = useFrameContext();
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
    set_cell_input: (id: string, input: string, commit?: boolean) => {
      id = id;
      frame.actions.setElement({
        obj: { id: element.id, str: input },
        commit,
      });
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

  const cm = (
    <CodeMirrorEditor
      actions={actions}
      id={""}
      options={getCMOptions()}
      value={element.str ?? ""}
      is_focused={focused}
      onKeyDown={(cm, e) => {
        if (
          e.key == "Enter" &&
          (e.altKey || e.metaKey || e.shiftKey || e.ctrlKey)
        ) {
          // don't do anything else -- we handle:
          e.preventDefault();
          // ensure use latest inpute, straight from the editor (avoiding all debounce issues)
          frame.actions.setElement({
            obj: { id: element.id, str: cm.getValue() },
            commit: false,
          });
          // evaluate in all cases
          frame.actions.runCodeElement({ id: element.id });
          // TODO: handle these cases
          if (e.altKey || e.metaKey) {
            // this is "evaluate and make new cell"
          } else if (e.shiftKey) {
            // this is "evaluate and move to next cell, making one if there isn't one."
          } else if (e.ctrlKey) {
            // this is "evaluate keeping focus", so nothing further to do.
          }
          return;
        }
      }}
    />
  );
  if (focused && canvasScale != 1) {
    return (
      <div
        style={{
          transform: `scale(${1 / canvasScale})`,
          transformOrigin: "top left",
          fontSize: (element.data?.fontSize ?? 14) * canvasScale,
        }}
      >
        {cm}
      </div>
    );
  } else {
    return cm;
  }
}

function getCMOptions() {
  const mode = "python";
  const account = redux.getStore("account");
  const immutable_editor_settings = account?.get("editor_settings");
  const editor_settings = immutable_editor_settings?.toJS() ?? {};
  const line_numbers =
    immutable_editor_settings?.get("jupyter_line_numbers") ?? false;
  return fromJS(cm_options(mode, editor_settings, line_numbers, false));
}
