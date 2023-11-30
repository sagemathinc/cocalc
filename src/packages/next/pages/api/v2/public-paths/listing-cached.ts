import { Request } from "express";

import { getPublicPathsListingCached } from "@cocalc/server/public-paths/listing-cached";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req: Request): Promise<any[] | null> {
  const account_id = await getAccountId(req);
  return await getPublicPathsListingCached(account_id != null);
}
