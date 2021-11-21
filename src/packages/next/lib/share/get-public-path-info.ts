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
  req? // if given, use to get account_id if necessary
) {
  if (
    typeof id != "string" ||
    id.length != 40 ||
    relativePath.indexOf("..") != -1 ||
    relativePath[0] == "/"
  ) {
    throw Error("invalid id or relativePath");
  }

  const pool = getPool("short");

  // Get the database entry that describes the public path
  const { rows } = await pool.query(
    "SELECT project_id, path, description, counter, compute_image, license, disabled, unlisted FROM public_paths WHERE vhost IS NULL AND id=$1",
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    throw Error("not found");
  }

  if (rows[0].disabled) {
    // Share is disabled, so account_id must be a collaborator on the project.
    if (!req) {
      throw Error("not found");
    }
    const account_id = await getAccountId(req);
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
