/*
Return the entire customize object for the site, or
a subset of fields (to cut down on bandwidth).

This calls something that is LRU cached on the server for a few seconds.
*/

import getCustomize from "@cocalc/server/settings/customize";
import { copy_with } from "@cocalc/util/misc";

export default async function handle(req, res) {
  const { fields } = req.body;

  try {
    const customize = await getCustomize();
    let result = fields ? copy_with(customize, fields) : customize;
    res.json(result);
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
