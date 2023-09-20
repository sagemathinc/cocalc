/*
Get the configured maximum allowed pay-as-you-go project upgrades.
*/

import { getMaxQuotas } from "@cocalc/server/purchases/project-quotas";

export default async function handle(_req, res) {
  try {
    res.json(await getMaxQuotas());
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
