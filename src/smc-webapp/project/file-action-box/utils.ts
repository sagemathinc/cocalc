import * as misc from "smc-util/misc2";
import * as immutable from "immutable";

export function valid_copy_destination({
  checked_files,
  destination_path,
  destination_project_id,
  src_project_id,
  current_path
}: {
  checked_files: immutable.Set<string>;
  destination_path: string;
  destination_project_id: string;
  src_project_id: string;
  current_path: string;
}) {
  const src_path = misc.path_split(checked_files.first() || "").head;
  if (
    destination_path === src_path &&
    src_project_id === destination_project_id
  ) {
    return false;
  }
  if (destination_project_id === "") {
    return false;
  }
  if (destination_path === current_path) {
    return false;
  }
  if (misc.startswith(destination_path, "/")) {
    return false;
  }
  return true;
}
