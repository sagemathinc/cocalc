export function open_file_use_entry(info, redux) : void {
  if (
    redux == null ||
    (info != null ? info.project_id : undefined) == null ||
    (info != null ? info.path : undefined) == null
  ) {
    return;
  }
  // mark this file_use entry read
  const f = redux.getActions("file_use");
  if (f != null) f.mark_file(info.project_id, info.path, "read");

  const p = redux.getActions("page");
  if (p != null) p.toggle_show_file_use();

  // open the file
  const a = redux.getProjectActions(info.project_id);
  if (a != null) {
    a.open_file({
      path: info.path,
      foreground: true,
      foreground_project: true,
      chat: info.show_chat
    });
  }
}
