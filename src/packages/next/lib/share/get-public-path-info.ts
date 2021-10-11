/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/backend/database";
import getContents from "./get-contents";
import getProjectInfo from "./get-project";
import { join } from "path";
const basePath = require("./basePath")();

export default async function getPublicPathInfo(id, relativePath) {

  if (
    typeof id != "string" ||
    id.length != 40 ||
    relativePath.indexOf("..") != -1 ||
    relativePath[0] == "/"
  ) {
    throw Error("invalid id or relativePath");
  }

  const pool = getPool('short');

  // Get the database entry that describes the public path
  const { rows } = await pool.query(
    "SELECT project_id, path, description, counter, compute_image, license FROM public_paths WHERE disabled IS NOT TRUE AND vhost IS NULL AND id=$1",
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    throw Error("not found");
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
