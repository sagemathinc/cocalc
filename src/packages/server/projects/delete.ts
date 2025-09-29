/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project delete functionality

Extracted from the v2 API to be reusable by both REST API and Conat API.
*/

import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import removeAllLicensesFromProject from "@cocalc/server/licenses/remove-all-from-project";
import { getProject } from "@cocalc/server/projects/control";
import userQuery from "@cocalc/database/user-query";
import { isValidUUID } from "@cocalc/util/misc";

export default async function deleteProject({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<void> {
  if (!isValidUUID(project_id)) {
    throw Error("project_id must be a valid UUID");
  }
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid UUID");
  }

  // If client is not an administrator, they must be a project collaborator in order to
  // delete a project.
  if (
    !(await userIsInGroup(account_id, "admin")) &&
    !(await isCollaborator({ account_id, project_id }))
  ) {
    throw Error("must be an owner to delete a project");
  }

  // Remove all project licenses
  await removeAllLicensesFromProject({ project_id });

  // Stop project
  const project = getProject(project_id);
  await project.stop();

  // Set "deleted" flag. We do this last to ensure that the project is not consuming any
  // resources while it is in the deleted state.
  //
  await userQuery({
    account_id,
    query: {
      projects: {
        project_id,
        deleted: true,
      },
    },
  });
}
