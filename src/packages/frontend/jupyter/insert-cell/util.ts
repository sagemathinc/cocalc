import { alert_message } from "@cocalc/frontend/alerts";

export function insertCell({
  frameActions,
  actions,
  type,
  content,
  id,
  position,
}: {
  frameActions;
  actions;
  type: "code" | "markdown";
  id: string; // id relative to which we insert
  position: "above" | "below";
  content?: string;
}): string | undefined {
  if (frameActions.current == null) {
    console.warn("frameActions not defined so can't insert cell");
    return;
  }
  frameActions.current.set_cur_id(id);
  const new_id = frameActions.current.insert_cell(position == "above" ? -1 : 1);
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
