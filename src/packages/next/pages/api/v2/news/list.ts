/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { Request, Response } from "express";

import listNews from "@cocalc/server/news/list";
import getParams from "lib/api/get-params";

export default async function handle(req: Request, res: Response) {
  try {
    const params = getParams(req, {
      allowGet: true,
    });
    res.json(await listNews(params));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
