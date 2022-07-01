/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import basePath from "lib/base-path";
import { isStarred as getIsStarred } from "@cocalc/server/public-paths/star";
import getAccountId from "lib/account/get-account";
import getGithubProjectId from "./project";
import * as sha1 from "sha1";
import fetch from "node-fetch";
import { RAW_MAX_SIZE_BYTES, api } from "./api";

export default async function getPublicPathInfoGist(
  user: string,
  gistId: string,
  req
) {
  const pool = getPool("short");

  // Get the database entry in public_paths that describes the gist
  const project_id = await getGithubProjectId();
  const id = sha1(project_id + "gist" + user + "/" + gistId);
  const gistUrl = `https://gist.github.com/${user}/${gistId}`;

  let { rows } = await pool.query(
    `SELECT project_id, path, description, counter::INT,
    (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE id=$1`,
    [id]
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    // use api to figure out actual filename and raw link
    const info = await api(`gists/${gistId}`);
    let path = "";
    for (const x in info.files) {
      path = x;
      break;
    }
    if (!path) {
      throw Error("no files in the gist");
    }
    const pool2 = getPool();
    await pool2.query(
      "INSERT INTO public_paths (id, project_id, path, last_edited, last_saved, created, description) VALUES($1, $2, $3, NOW(), NOW(), NOW(), $4)",
      [id, project_id, path, `GitHub gist at ${gistUrl}`]
    );
    rows = (
      await pool2.query(
        `SELECT project_id, path, description, counter::INT,
    (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE id=$1`,
        [id]
      )
    ).rows;
  }

  const account_id = await getAccountId(req);

  // if user is signed in, whether or not they stared this.
  const isStarred = account_id ? await getIsStarred(id, account_id) : null;
  const relativePath = "";

  let contents;
  try {
    const url = `https://gist.githubusercontent.com/${user}/${gistId}/raw/`;
    const content = await (
      await fetch(url, { size: RAW_MAX_SIZE_BYTES })
    ).text();

    contents = { content, size: content.length };
  } catch (error) {
    return { id, ...rows[0], error: error.toString() };
  }
  const projectTitle = `${user}'s GitHub Gists -- https://gist.github.com/${user}`;

  return {
    id,
    ...rows[0],
    contents,
    relativePath,
    projectTitle,
    basePath,
    isStarred,
    githubOrg: user,
  };
}
