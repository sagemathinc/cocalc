/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run code in a project.
*/

import { Request } from "express";

import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { getLogger } from "@cocalc/backend/logger";
import { saveStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED } from "@cocalc/util/consts/bookmarks";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  BookmarkAddInputSchema,
  BookmarkAddOutputSchema,
  BookmarkSetInputSchema,
  BookmarkSetOutputType,
} from "lib/api/schema/bookmarks";

const L = getLogger("api:v2:bookmark:add");

async function handle(req, res) {
  try {
    res.json(await add(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function add(req: Request): Promise<BookmarkSetOutputType> {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  const { project_id, type, payload } = BookmarkSetInputSchema.parse(
    getParams(req),
  );

  switch (type) {
    case STARRED: {
      if (!(await isCollaborator({ account_id, project_id }))) {
        throw Error("user must be a collaborator on the project");
      }

      L.debug("set", { project_id, payload });
      await saveStarredFilesBookmarks({
        project_id,
        payload,
        account_id,
        mode: "add",
      });

      return { status: "success", project_id, type };
    }

    default:
      return { status: "error", error: `cannot handle type '${type}'` };
  }
}

export default apiRoute({
  addBookmarks: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: BookmarkAddInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: BookmarkAddOutputSchema,
      },
    ])
    .handler(handle),
});
