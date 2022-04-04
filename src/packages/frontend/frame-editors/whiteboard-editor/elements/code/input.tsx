import { useMemo, useState } from "react";
import { useFrameContext } from "../../hooks";
import { Element } from "../../types";
import { fromJS, Map } from "immutable";
import { cm_options } from "@cocalc/frontend/jupyter/cm_options";
import { codemirror_to_jupyter_pos } from "@cocalc/frontend/jupyter/util";
import {
  CodeMirrorEditor,
  Actions as EditorActions,
} from "@cocalc/frontend/jupyter/codemirror-editor";
import { redux } from "@cocalc/frontend/app-framework";
import { getJupyterActions } from "./actions";
import { Actions as WhiteboardActions } from "../../actions";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { three_way_merge as threeWayMerge } from "@cocalc/sync/editor/generic/util";
import { SELECTED_BORDER_COLOR } from "../style";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  onFocus?: () => void;
  onBlur?: () => void;
  isFocused?: boolean;
  cursors?: { [account_id: string]: any[] };
  mode?;
}

export default function Input({
  element,
  canvasScale,
  onFocus,
  onBlur,
  isFocused,
  cursors,
  mode,
}: Props) {
  const frame = useFrameContext();
  const [complete, setComplete] = useState<Map<string, any> | undefined>(
    undefined
  );
  const actions = useMemo(() => {
    return new Actions(frame, element.id, setComplete);
  }, [element.id]); // frame can't change meaningfully.

  return (
    <div>
      <CodeMirrorEditor
        refresh={canvasScale /* fresh if canvas scale changes */}
        contenteditable={
          true /* we *must* use contenteditable so scaling works */
        }
        style={{
          border: isFocused
            ? `1px solid ${SELECTED_BORDER_COLOR}`
            : "1px solid rgb(207, 207, 207)",
          borderRadius: "2px",
        }}
        is_focused={isFocused}
        actions={actions}
        id={element.id}
        onFocus={onFocus}
        onBlur={onBlur}
        options={getCMOptions(mode)}
        value={element.str ?? ""}
        complete={complete}
        cursors={fromJS(cursors)}
        onKeyDown={(cm, e) => {
          if (
            e.key == "Enter" &&
            (e.altKey || e.metaKey || e.shiftKey || e.ctrlKey)
          ) {
            // don't do anything else -- we handle:
            e.preventDefault();
            // ensure use latest input, straight from the editor (avoiding all debounce issues)
            const str = cm.getValue();
            frame.actions.setElement({
              obj: { id: element.id, str },
              commit: false,
            });
            // evaluate in all cases
            frame.actions.runCodeElement({ id: element.id, str });
            // TODO: handle these cases
            if (e.altKey || e.metaKey) {
              // this is "evaluate and make new cell"...?
            } else if (e.shiftKey) {
              // This is super annoying.
              /*
              // this is "evaluate and move to next cell, making one if there isn't one."
              const id = frame.actions.createAdjacentElement(
                element.id,
                "bottom"
              );
              if (!id) return;
              frame.actions.setSelectedTool(frame.id, "select");
              frame.actions.setSelection(frame.id, id);
              frame.actions.centerElement(id);
              */
            } else if (e.ctrlKey) {
              // this is "evaluate keeping focus", so nothing further to do.
            }
            return;
          }
        }}
      />
    </div>
  );
}

class Actions implements EditorActions {
  private frame: {
    project_id: string;
    path: string;
    actions: WhiteboardActions;
  };
  private id: string;
  private _complete: Map<string, any> | undefined = undefined;
  private setComplete: (complete: Map<string, any> | undefined) => void;
  private introspect: Map<string, any> | undefined = undefined;
  private setIntrospect: (complete: Map<string, any> | undefined) => void;
  private jupyter_actions: JupyterActions | undefined = undefined;

  constructor(frame, id, setComplete) {
    this.frame = frame;
    this.id = id;
    this.setComplete = (complete) => {
      this._complete = complete;
      setComplete(complete);
    };
    this.setIntrospect = (introspect) => {
      this.introspect = introspect;
      this.frame.actions.setState({ introspect });
    };
    this.introspect = undefined;
  }

  private async getJupyterActions(): Promise<JupyterActions> {
    if (this.jupyter_actions != null) {
      return this.jupyter_actions;
    }
    this.jupyter_actions = await getJupyterActions({
      project_id: this.frame.project_id,
      path: this.frame.path,
    });
    // patch some functions from JupyterActions to use ones defined
    // in this object:
    this.jupyter_actions.select_complete = this.select_complete.bind(this);
    this.jupyter_actions.save = this.save.bind(this);
    return this.jupyter_actions;
  }

  set_cell_input(_id: string, input: string, commit?: boolean) {
    this.frame.actions.setElement({
      obj: { id: this.id, str: input },
      commit,
    });
  }

  undo() {
    this.frame.actions.undo();
  }

  redo() {
    this.frame.actions.redo();
  }

  in_undo_mode() {
    return false;
  }

  async save(): Promise<void> {
    await this.frame.actions.save(true);
  }

  set_cursor_locs(locs: any[], sideEffect?: boolean) {
    this.frame.actions.setCursors(this.id, locs, sideEffect);
  }

  // Everything for the rest of the class is for introspection and tab completion.
  // It is more or less a rewrite of similar functions in
  // @cocalc/frontend/juputer/actions.ts but to make sense for cells in a whiteboard.

  // TAB COMPLETION
  select_complete(_id: string, item: string, complete?: Map<string, any>) {
    if (complete == null) {
      complete = this._complete;
    }
    this.clear_complete();
    if (complete == null) return;
    const input = complete.get("code");
    if (input == null || complete.get("error")) return;
    const starting = input.slice(0, complete.get("cursor_start"));
    const ending = input.slice(complete.get("cursor_end"));
    const new_input = threeWayMerge({
      base: complete.get("base"),
      local: starting + item + ending,
      remote:
        this.frame.actions.store.getIn(["elements", this.id, "str"]) ?? "",
    });
    this.set_cell_input(this.id, new_input);
  }

  complete_handle_key(_: string, keyCode: number) {
    if (this.jupyter_actions == null) return;
    this.jupyter_actions.complete_handle_key(_, keyCode);
    // TODO -- need to implement this.jupyter_actions.complete_cell somehow..
  }

  clear_complete() {
    this.setComplete(undefined);
  }

  async complete(
    code: string,
    pos?: { line: number; ch: number } | number,
    id?: string,
    offset?: any
  ): Promise<boolean> {
    const actions = await this.getJupyterActions();
    const popup = await actions.complete(code, pos, id, offset);
    this.setComplete(actions.store.get("complete"));
    return popup;
  }

  // INTROSPECTION (shift+tab) -- shows help about what is before cursor
  is_introspecting() {
    return this.introspect != null;
  }

  introspect_close() {
    this.setIntrospect(undefined);
  }

  async introspect_at_pos(
    code: string,
    level: 0 | 1,
    pos: { ch: number; line: number }
  ): Promise<void> {
    if (code === "") return; // no-op if there is no code (should never happen)
    this.frame.actions.show_recently_focused_frame_of_type(
      "introspect",
      "row",
      false,
      2 / 3
    );
    const actions = await this.getJupyterActions();
    const introspect = await actions.introspect(
      code,
      level,
      codemirror_to_jupyter_pos(code, pos)
    );
    this.setIntrospect(introspect);
  }
}

function getCMOptions(mode) {
  const account = redux.getStore("account");
  const immutable_editor_settings = account?.get("editor_settings");
  const editor_settings = immutable_editor_settings?.toJS() ?? {};
  const line_numbers =
    immutable_editor_settings?.get("jupyter_line_numbers") ?? false;
  return fromJS(cm_options(mode, editor_settings, line_numbers, false));
}
