/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// NOOP endpoint - bookmarks now handled by conat
// Keeping endpoint for backwards compatibility with older clients

import { Request } from "express";

import { STARRED_FILES } from "@cocalc/util/consts/bookmarks";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(
  req: Request,
): Promise<{
  status: "success" | "error";
  stars?: string[];
  type?: string;
  project_id?: string;
  error?: string;
}> {
  const { type, project_id } = req.body;

  // NOOP: Always return empty bookmarks since they're now handled by conat
  switch (type) {
    case STARRED_FILES: {
      return {
        type,
        project_id,
        stars: [],
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

export default handle;
