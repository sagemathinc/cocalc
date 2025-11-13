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
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function set(
  req: Request,
): Promise<{
  status: "success" | "error";
  project_id?: string;
  type?: string;
  error?: string;
}> {
  const { project_id, type } = req.body;

  // NOOP: Always return success since bookmarks are now handled by conat
  switch (type) {
    case STARRED_FILES: {
      return { status: "success", project_id, type };
    }

    default:
      return { status: "error", error: `cannot handle type '${type}'` };
  }
}

export default handle;
