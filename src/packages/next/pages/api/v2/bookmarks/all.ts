/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Request } from "express";

import { loadAllStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED_FILES } from "@cocalc/util/consts/bookmarks";
import { apiRoute, apiRouteOperation } from "lib/api";
import { processGetRequest } from "lib/api/bookmarks";
import {
  BookmarkAllInputSchema,
  BookmarkAllOutputSchema,
  BookmarkAllOutputType,
} from "lib/api/schema/bookmarks";

async function handle(req, res) {
  try {
    res.json(await all(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function all(req: Request): Promise<BookmarkAllOutputType> {
  const { account_id, type } = await processGetRequest(req);

  switch (type) {
    case STARRED_FILES: {
      const { stars, last_edited } = await loadAllStarredFilesBookmarks({
        account_id,
      });

      return {
        type,
        stars,
        last_edited,
        status: "success",
      };
    }

    default:
      return {
        type,
        status: "error",
        error: `cannot handle type '${type}'`,
      };
  }
}

export default apiRoute({
  allBookmarks: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: BookmarkAllInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: BookmarkAllOutputSchema,
      },
    ])
    .handler(handle),
});
