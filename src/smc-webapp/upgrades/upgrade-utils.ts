/* Given an immutable.js project object (from the project_map),
   these functions allow you to query some things about it. */

import { Map } from "immutable";

export function has_internet_access(project: undefined | Map<string, any>): boolean {
  if (project == null) return false;
  if (project.getIn(["settings", "network"])) return true;
  const users = project.get("users");
  if (users == null) return false;
  let result = false;
  users.forEach(user => {
    if (user.getIn(["upgrades", "network"])) {
      result = true;
      return false; // stop iteration
    }
  });
  return result;
}
