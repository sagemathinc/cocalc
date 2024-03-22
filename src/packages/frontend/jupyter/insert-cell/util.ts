import { alert_message } from "@cocalc/frontend/alerts";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { JupyterActions } from "../browser-actions";
import { Position } from "./types";

export function insertCell({
  frameActions,
  actions,
  type,
  content,
  id,
  position,
}: {
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  actions: JupyterActions;
  type: "code" | "markdown";
  id: string; // id relative to which we insert
  position: Position;
  content?: string;
}): string | undefined {
  if (frameActions.current == null) {
    console.warn("frameActions not defined so can't insert cell");
    return;
  }
  frameActions.current.set_cur_id(id);
  const new_id = frameActions.current.insert_cell(
    position === "above" ? -1 : 1,
  );

  // my first idea was to set "new_id=id" above, but that doesn't work – the cell ends up being empty.
  // instead, insert a new cell below and delete the currnet one
  if (position === "replace") {
    actions.delete_cells([id]);
  }
  frameActions.current.set_cur_id(new_id);

  if (content) {
    frameActions.current.set_cell_input(new_id, content);
  }

  switch (type) {
    case "markdown":
      actions.set_cell_type(new_id, "markdown");
      if (!content) {
        frameActions.current.switch_md_cell_to_edit(new_id);
      }
      break;
    case "code":
      actions.set_cell_type(new_id, "code");
      frameActions.current.switch_code_cell_to_edit(new_id);
      break;
  }

  return new_id;
}

export async function pasteCell({
  frameActions,
  actions,
  position,
  id,
}: {
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  actions: JupyterActions;
  id: string; // id relative to which we insert
  position: Position;
}): Promise<void> {
  try {
    // First time around (in Chrome at least), this will require a confirmation by the user
    // It fails with a "permission denied"
    const content = await navigator.clipboard.readText();
    insertCell({
      frameActions,
      actions,
      type: "code",
      content,
      id,
      position,
    });
  } catch (err) {
    alert_message({
      type: "error",
      title: "Permission denied",
      message: `You have to enable clipboard access to make pasting from the clipboard work.\n${err}`,
    });
  }
}
