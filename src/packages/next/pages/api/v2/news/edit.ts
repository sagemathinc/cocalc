/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Request, Response } from "express";

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import editNews from "@cocalc/server/news/edit";
import { clearCache } from "@cocalc/database/postgres/news";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req: Request, res: Response) {
  try {
    const result = await doIt(req);
    // edit has been successful: clear cache
    // (there is also a clearCache in server/news/edit but it isn't effective. Module loaded more than once? Can't hurt, though.)
    clearCache();
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req: Request) {
  // date and until are unix timestamps in seconds
  const { id, title, text, date, channel, url, tags, hide, until } = getParams(req);

  const account_id = await getAccountId(req);

  if (account_id == null) {
    throw Error("must be signed in to create/edit news");
  }

  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can create/edit news items");
  }

  if (title == null) {
    throw new Error("must provide title");
  }

  if (text == null) {
    throw new Error("must provide text");
  }

  return await editNews({
    id,
    title,
    text,
    url,
    tags,
    date: date ? new Date(1000 * date) : new Date(),
    channel,
    hide: !!hide,
    until: until ? new Date(1000 * until) : undefined,
  });
}
