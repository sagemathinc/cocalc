/*
Return the entire customize object for the site, or
a subset of fields (to cut down on bandwidth).

This calls something that is LRU cached on the server for a few seconds.
*/

import getCustomize from "@cocalc/database/settings/customize";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const { fields } = getParams(req);

  try {
    res.json(await getCustomize(fields));
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
