export function open_file_use_entry(
  project_id: string,
  path: string,
  show_chat: boolean,
  redux: any,
  payload: any
): void {
  if (redux == null) {
    return;
  }
  // mark this file_use entry read
  const f = redux.getActions("file_use");
  if (f != null) f.mark_file(project_id, path, "read");

  const p = redux.getActions("page");
  if (p != null) p.toggle_show_file_use();

  // open the file
  const a = redux.getProjectActions(project_id);
  if (a != null) {
    a.open_file({
      path: path,
      foreground: true,
      foreground_project: true,
      chat: show_chat,
      payload: payload
    });
  }
}
