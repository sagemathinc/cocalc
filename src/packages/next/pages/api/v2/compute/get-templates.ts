/*
Get Templates
*/

import { getTemplates } from "@cocalc/server/compute/templates";

export default async function handle(_req, res) {
  try {
    res.json(await await getTemplates());
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
