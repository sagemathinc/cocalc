/*
Get the configured prices for pay-as-you-go project upgrades.
*/

import { getPrices } from "@cocalc/server/purchases/project-quotas";

export default async function handle(_req, res) {
  try {
    res.json(await getPrices());
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
