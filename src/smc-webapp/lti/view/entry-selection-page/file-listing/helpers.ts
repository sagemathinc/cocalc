import { Set } from "immutable";

// Returns the inclusion/exclusion status of the path's deepest "parent"
// including itself.
// Assumes included and excluded are mutually exclusive
export function is_implicitly_included(
  path: string,
  included: Set<string>,
  excluded: Set<string>
) {
  let is_selected = false;

  path.split("/").reduce((ancestor, folder) => {
    if (included.has(ancestor + "/")) {
      is_selected = true;
    } else if (excluded.has(ancestor + "/")) {
      is_selected = false;
    }
    return ancestor + "/" + folder;
  });

  return is_selected;
}
