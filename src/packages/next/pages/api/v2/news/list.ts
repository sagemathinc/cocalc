/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Request, Response } from "express";

import { get } from "@cocalc/server/news/get";
import getParams from "lib/api/get-params";

export default async function handle(req: Request, res: Response) {
  try {
    const params = getParams(req);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");

    res.json(await get(params));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
