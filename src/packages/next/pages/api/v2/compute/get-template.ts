/*
Get A Single Template
*/

import { getTemplate } from "@cocalc/server/compute/templates";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const { id } = getParams(req);
  return await getTemplate(id);
}
