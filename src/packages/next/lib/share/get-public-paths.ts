/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Get the public paths associated to a given project.  Unlisted paths are NOT included.
*/

import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { PublicPath } from "./types";
import { isUUID } from "./util";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";

export default async function getPublicPaths(
  project_id: string,
  req //  use to get account_id if necessary
): Promise<PublicPath[]> {
  if (!isUUID(project_id)) {
    throw Error("project_id must be a uuid");
  }
  // short: user might create a new public path then want to look at it shortly thereafter
  const pool = getPool("short");
  const result = await pool.query(
    `SELECT id, path, description, ${timeInSeconds(
      "last_edited"
    )}, disabled, unlisted, authenticated FROM public_paths WHERE project_id=$1 ORDER BY last_edited DESC`,
    [project_id]
  );

  return await filterNonPublicAndNotAuthenticated(result.rows, project_id, req);
}

async function filterNonPublicAndNotAuthenticated(
  rows: PublicPath[],
  project_id,
  req
): Promise<PublicPath[]> {
  const v: any[] = [];
  let isCollab: boolean | undefined = undefined;
  let is_authenticated: boolean | undefined = undefined;
  for (const row of rows) {
    if (!row.disabled && !row.unlisted && !row.authenticated) {
      v.push(row);
      continue;
    }
    if (isCollab == null) {
      const account_id = await getAccountId(req);
      is_authenticated = account_id != null;
      if (account_id) {
        isCollab = await isCollaborator({
          account_id,
          project_id,
        });
      } else {
        isCollab = false;
      }
    }
    if (isCollab) {
      v.push(row);
    } else if (row.authenticated && is_authenticated) {
      v.push(row);
    }
  }
  return v;
}
