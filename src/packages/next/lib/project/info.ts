/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getCollaborators from "lib/share/get-collaborators";
import getPublicPaths from "lib/share/get-public-paths";

export default async function getProjectInfo(project_id: string, req) {
  return {
    publicPaths: await getPublicPaths(project_id, req),
    collaborators: await getCollaborators(project_id),
  };
}
