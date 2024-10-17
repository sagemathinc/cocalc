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

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  BookmarkSetOutputSchema,
  BookmarkSetInputSchema,
  BookmarkSetOutputType,
} from "lib/api/schema/bookmarks";
import { getLogger } from "@cocalc/backend/logger";
import { saveStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED } from "@cocalc/util/consts/bookmarks";

const L = getLogger("api:v2:bookmark:set");

async function handle(req, res) {
  try {
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function set(req: Request): Promise<BookmarkSetOutputType> {
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
      await saveStarredFilesBookmarks({ project_id, account_id, payload, mode: "set" });

      return { status: "success", project_id, type };
    }

    default:
      return { status: "error", error: `cannot handle type '${type}'` };
  }
}

export default apiRoute({
  setBookmarks: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: BookmarkSetInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: BookmarkSetOutputSchema,
      },
    ])
    .handler(handle),
});
