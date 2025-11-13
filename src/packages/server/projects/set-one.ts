/* Updates an existing project's name, title, and/or description. May be
   restricted such that the query is executed as though by a specific account_id.

   This function is simply a wrapper around the userQuery function.
*/
import userQuery from "@cocalc/database/user-query";

import { DBProject } from "./get";

export default async function setProject({
  acting_account_id,
  project_id,
  project_update,
}: {
  // This function executes as though the account id below made the request; this has the
  // effect of enforcing an authorization check that the acting account is allowed to
  // modify the desired project.
  //
  acting_account_id: string;
  project_id: string;
  project_update: Omit<DBProject, "project_id">;
}): Promise<DBProject | undefined> {
  const { description, title, name } = project_update;
  return userQuery({
    account_id: acting_account_id,
    query: {
      projects: {
        // Any provided values must be non-empty in order for userQuery to SET values
        // instead of fetching them.
        //
        project_id,
        ...(name && { name }),
        ...(title && { title }),
        ...(description && { description }),
      },
    },
  });
}
