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

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Input({ element, focused, canvasScale }: Props) {
  const frame = useFrameContext();
  const [complete, setComplete] = useState<Map<string, any> | undefined>(
    undefined
  );
  const [introspect, setIntrospect] = useState<Map<string, any> | undefined>(
    undefined
  );
  const actions = useMemo(() => {
    return new Actions(frame, element.id, setComplete, setIntrospect);
  }, [element.id]); // frame can't change meaningfully.

  const cm = (
    <div>
      <CodeMirrorEditor
        actions={actions}
        id={element.id}
        options={getCMOptions()}
        value={element.str ?? ""}
        is_focused={focused}
        complete={complete}
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
      <pre>{JSON.stringify(introspect?.toJS())}</pre>
    </div>
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

class Actions implements EditorActions {
  private frame: {
    project_id: string;
    path: string;
    actions: WhiteboardActions;
  };
  private id: string;
  private setComplete: (complete: Map<string, any> | undefined) => void;
  private setIntrospect: (complete: Map<string, any> | undefined) => void;
  private introspect: any;
  private jupyter_actions: JupyterActions | undefined = undefined;

  constructor(frame, id, setComplete, setIntrospect) {
    this.frame = frame;
    this.id = id;
    this.setComplete = setComplete;
    this.setIntrospect = setIntrospect;
    this.introspect = undefined;
  }

  private async getJupyterActions(): Promise<JupyterActions> {
    if (this.jupyter_actions != null) {
      return this.jupyter_actions;
    }
    this.jupyter_actions = await getJupyterActions(
      this.frame.project_id,
      this.frame.path
    );
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
    return (async () => {})();
  }

  set_cursor_locs(locs: any[], sideEffect?: boolean) {
    this.frame.actions.setCursors(this.id, locs, sideEffect);
  }

  // Everything below is related to introspection / tab completion...
  select_complete(id: string, item: string, complete?: Map<string, any>) {
    id = id;
    item = item;
    complete = complete;
    this.clear_complete();
  }

  complete_handle_key(_: string, keyCode: number) {
    if (this.jupyter_actions == null) return;
    this.jupyter_actions.complete_handle_key(_, keyCode);
    // TODO -- need to implement this.jupyter_actions.complete_cell somehow..
  }

  clear_complete() {
    this.setComplete(undefined);
  }

  is_introspecting() {
    return this.introspect != null;
  }

  introspect_close() {
    this.introspect = undefined;
    this.setIntrospect(undefined);
  }

  async introspect_at_pos(
    code: string,
    level: 0 | 1,
    pos: { ch: number; line: number }
  ): Promise<void> {
    console.log("introspect_at_pos", { code, level, pos });
    if (code === "") return; // no-op if there is no code (should never happen)
    const actions = await this.getJupyterActions();
    await actions.introspect(code, level, codemirror_to_jupyter_pos(code, pos));
    this.introspect = actions.store.get("introspect");
    this.setIntrospect(this.introspect);
    console.log("introspect = ", this.introspect?.toJS());
  }

  async complete(
    code: string,
    pos?: { line: number; ch: number } | number,
    id?: string,
    offset?: any
  ): Promise<boolean> {
    console.log("complete", { code, pos, id, offset });
    const actions = await this.getJupyterActions();
    const popup = await actions.complete(code, pos, id, offset);
    this.setComplete(actions.store.get("complete"));
    return popup;
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
