/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Get the public paths associated to a given project.  Unlisted paths are NOT included.
*/

import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { PublicPath } from "./types";
import { isUUID } from "./util";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";
import { getProjectAvatarTiny } from "./project-avatar-image";

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
    )}, disabled, unlisted, authenticated,
    counter::INT,
     (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE project_id=$1 ORDER BY stars DESC, last_edited DESC`,
    [project_id]
  );

  const v = await filterNonPublicAndNotAuthenticated(
    result.rows,
    project_id,
    req
  );
  const avatar_image_tiny = await getProjectAvatarTiny(project_id);
  if (avatar_image_tiny) {
    for (const x of v) {
      x.avatar_image_tiny = avatar_image_tiny;
    }
  }
  return v;
}

async function filterNonPublicAndNotAuthenticated(
  rows: PublicPath[],
  project_id,
  req
): Promise<PublicPath[]> {
  const v: any[] = [];
  let isCollab: boolean | undefined = undefined;
  let isAuthenticated: boolean | undefined = undefined;
  for (const row of rows) {
    if (!row.disabled && !row.unlisted && !row.authenticated) {
      v.push(row);
      continue;
    }
    if (isCollab == null) {
      const account_id = await getAccountId(req);
      isAuthenticated = account_id != null;
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
    } else if (row.authenticated && isAuthenticated) {
      v.push(row);
    }
  }
  return v;
}
