/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
export function open_file_use_entry(info, redux) {
  if (
    redux == null ||
    (info != null ? info.project_id : undefined) == null ||
    (info != null ? info.path : undefined) == null
  ) {
    return;
  }
  // mark this file_use entry read
  redux.getActions("file_use").mark_file(info.project_id, info.path, "read");
  redux.getActions("page").toggle_show_file_use();
  // open the file
  return require.ensure([], () => {
    return redux.getProjectActions(info.project_id).open_file({
      path: info.path,
      foreground: true,
      foreground_project: true,
      chat: info.show_chat
    });
  });
}
