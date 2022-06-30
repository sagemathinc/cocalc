/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import basePath from "lib/base-path";
import { isStarred as getIsStarred } from "@cocalc/server/public-paths/star";
import getAccountId from "lib/account/get-account";
import { join } from "path";
import getContents from "./get-contents";

export default async function getPublicPathInfoGithub(
  id: string,
  githubOrg: string,
  githubRepo: string,
  segments: string[],
  req
) {
  if (typeof id != "string" || id.length != 40) {
    throw Error("invalid id");
  }

  const pool = getPool("short");

  // Get the database entry that describes the public path
  const { rows } = await pool.query(
    `SELECT project_id, path, description, counter::INT,
    (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE id=$1`,
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    throw Error("not found or invalid");
  }
  const relativePath = join(...segments);

  const account_id = await getAccountId(req);

  // if user is signed in, whether or not they stared this.
  const isStarred = account_id ? await getIsStarred(id, account_id) : null;

  let contents;
  try {
    contents = await getContents(id, githubOrg, githubRepo, segments);
  } catch (error) {
    return { id, ...rows[0], relativePath, error: error.toString() };
  }
  const projectTitle = `Title of github repo at ${githubOrg} / ${githubRepo}`;

  return {
    id,
    ...rows[0],
    contents,
    relativePath,
    projectTitle,
    basePath,
    isStarred,
  };
}
