/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Request } from "express";

import { loadStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED_FILES } from "@cocalc/util/consts/bookmarks";
import { apiRoute, apiRouteOperation } from "lib/api";
import { processGetRequest } from "lib/api/bookmarks";
import {
  BookmarkGetInputSchema,
  BookmarkGetOutputSchema,
  BookmarkGetOutputType,
} from "lib/api/schema/bookmarks";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req: Request): Promise<BookmarkGetOutputType> {
  const { project_id, account_id, type } = await processGetRequest(req);

  switch (type) {
    case STARRED_FILES: {
      const { stars, last_edited } = await loadStarredFilesBookmarks({
        project_id,
        account_id,
      });

      return {
        type,
        project_id,
        stars,
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
