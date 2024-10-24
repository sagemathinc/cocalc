/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Request } from "express";

import { getLogger } from "@cocalc/backend/logger";
import { saveStarredFilesBookmarks } from "@cocalc/server/bookmarks/starred";
import { STARRED_FILES } from "@cocalc/util/consts/bookmarks";
import { apiRoute, apiRouteOperation } from "lib/api";
import { processSetRequest } from "lib/api/bookmarks";
import {
  BookmarkRemoveInputSchema,
  BookmarkRemoveOutputSchema,
  BookmarkSetOutputType,
} from "lib/api/schema/bookmarks";

const L = getLogger("api:v2:bookmark:remove");

async function handle(req, res) {
  try {
    res.json(await remove(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function remove(req: Request): Promise<BookmarkSetOutputType> {
  const { project_id, account_id, type, stars } = await processSetRequest(req);

  switch (type) {
    case STARRED_FILES: {
      L.debug("set", { project_id, stars });
      await saveStarredFilesBookmarks({
        project_id,
        account_id,
        stars,
        mode: "remove",
      });

      return { status: "success", project_id, type };
    }

    default:
      return { status: "error", error: `cannot handle type '${type}'` };
  }
}

export default apiRoute({
  removeBookmarks: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: BookmarkRemoveInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: BookmarkRemoveOutputSchema,
      },
    ])
    .handler(handle),
});
