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
