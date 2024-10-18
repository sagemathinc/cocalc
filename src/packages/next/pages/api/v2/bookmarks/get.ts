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
  BookmarkGetOutputSchema,
  BookmarkGetInputSchema,
  BookmarkGetOutputType,
} from "lib/api/schema/bookmarks";
import { loadStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED } from "@cocalc/util/consts/bookmarks";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req: Request): Promise<BookmarkGetOutputType> {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  const { project_id, type } = BookmarkGetInputSchema.parse(getParams(req));

  switch (type) {
    case STARRED: {
      if (!(await isCollaborator({ account_id, project_id }))) {
        throw Error("user must be a collaborator on the project");
      }

      const { payload, last_edited } = await loadStarredFilesBookmarks({
        project_id,
        account_id,
      });

      return {
        type,
        project_id,
        payload,
        last_edited,
        status: "success",
      };
    }

    default:
      return {
        type,
        project_id,
        status: "error",
        error: `cannot handle type '${type}'`,
      };
  }
}

export default apiRoute({
  getBookmarks: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: BookmarkGetInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: BookmarkGetOutputSchema,
      },
    ])
    .handler(handle),
});
