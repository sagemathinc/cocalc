/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import getContents, { getSizeLimit } from "./get-contents";
import getProjectInfo from "./get-project";
import { join } from "path";
import basePath from "lib/base-path";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";
import { isStarred as getIsStarred } from "@cocalc/server/public-paths/star";
import getProxiedPublicPathInfo from "lib/share/proxy/get-proxied-public-path-info";

export default async function getPublicPathInfo({
  id,
  relativePath,
  public_path,
  req,
}: {
  id: string;
  relativePath?: string;
  public_path?: string[];
  req; // use to get account_id if necessary
}) {
  if (typeof id != "string" || id.length != 40) {
    throw Error("invalid id");
  }

  // TODO: currently not using any caching because when editing and saving, we want info to update.
  // However, we should implement this by using a query param to prevent using cache?
  const pool = getPool();

  // Get the database entry that describes the public path
  const { rows } = await pool.query(
    `SELECT project_id, path, description, compute_image, license, disabled, unlisted,
    authenticated, url, redirect, created, last_edited,
    counter::INT,
    (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths WHERE vhost IS NULL AND id=$1`,
    [id],
  );
  if (rows.length == 0 || rows[0].project_id == null || rows[0].path == null) {
    throw Error("not found");
  }

  if (relativePath == null) {
    if (public_path?.[1] == "files") {
      // only files/ implemented right now; we might add other things like edit/ later?
      relativePath = public_path.slice(2).join("/");
    } else {
      relativePath = "";
    }
  }

  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    // a security check
    throw Error("invalid relativePath");
  }

  const { disabled, authenticated } = rows[0];
  const account_id = await getAccountId(req);

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

  // if user is signed in, whether or not they stared this.
  const isStarred = account_id ? await getIsStarred(id, account_id) : null;

  try {
    let details;
    if (rows[0].url) {
      // only proxied public paths have url attribute
      details = await getProxiedPublicPathInfo(rows[0].url, public_path ?? []);
      if (details.contents != null) {
        const limit = getSizeLimit(
          public_path
            ? (public_path[public_path.length - 1] ?? "")
            : rows[0].url,
        );
        if (details.contents.size > limit) {
          // it would be nice to do this *BEFORE* pulling it from github, etc., but
          // life is short.
          details.contents.content =
            "File too big to be displayed; download it instead.";
          details.contents.size = details.contents.content.length;
        }
      }
    } else {
      const { title, avatar_image_full } = await getProjectInfo(
        rows[0].project_id,
        ["title", "avatar_image_full"],
        "medium",
      );
      details = {
        contents: await getContents(
          rows[0].project_id,
          join(rows[0].path, relativePath),
          rows[0].unlisted,
        ),
        projectTitle: title,
        projectAvatarImage: avatar_image_full,
      };
    }
    return {
      id,
      ...rows[0],
      relativePath,
      basePath,
      isStarred,
      ...details,
      created: rows[0].created?.toISOString() ?? null,
      last_edited: rows[0].last_edited?.toISOString() ?? null,
    };
  } catch (error) {
    return {
      id,
      ...rows[0],
      relativePath,
      isStarred,
      created: rows[0].created?.toISOString() ?? null,
      last_edited: rows[0].last_edited?.toISOString() ?? null,
      error: error.toString(),
    };
  }
}
