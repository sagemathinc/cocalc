/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import getContents from "./get-contents";
import getProjectInfo from "./get-project";
import { join } from "path";
import basePath from "lib/base-path";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";

export default async function getPublicPathInfo(
  id: string,
  relativePath: string,
  req // use to get account_id if necessary
) {
  if (
    typeof id != "string" ||
    id.length != 40 ||
    relativePath.indexOf("..") != -1 ||
    relativePath[0] == "/"
  ) {
    throw Error("invalid id or relativePath");
  }

  // TODO: currently not using any caching because when editing and saving, we want info to update.
  // However, we should implement this by using a query param to prevent using cache?
  const pool = getPool();

  // Get the database entry that describes the public path
  const { rows } = await pool.query(
    "SELECT project_id, path, description, counter, compute_image, license, disabled, unlisted, authenticated FROM public_paths WHERE vhost IS NULL AND id=$1",
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    throw Error("not found");
  }

  const { disabled, authenticated } = rows[0];
  const account_id =
    disabled || authenticated ? await getAccountId(req) : undefined;

  if (disabled) {
    // Share is disabled, so account_id must be a collaborator on the project.
    if (
      !account_id ||
      !(await isCollaborator({
        account_id,
        project_id: rows[0].project_id,
      }))
    ) {
      throw Error("not found");
    }
  }

  if (authenticated) {
    // Only authenticated users are allowed to access
    if (account_id == null) {
      throw Error("not found");
    }
  }

  let contents;
  try {
    contents = await getContents(
      rows[0].project_id,
      join(rows[0].path, relativePath)
    );
  } catch (error) {
    return { id, ...rows[0], relativePath, error: error.toString() };
  }
  const projectTitle = (await getProjectInfo(rows[0].project_id)).title;

  return { id, ...rows[0], contents, relativePath, projectTitle, basePath };
}
