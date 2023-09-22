/*
Get the configured maximum allowed pay-as-you-go project upgrades.
*/

import type { Request, Response } from "express";

import { areGPUsAvailableForPAYGO } from "@cocalc/server/purchases/project-quotas";

export default async function handle(_req: Request, res: Response) {
  try {
    const val = await areGPUsAvailableForPAYGO();
    res.json(val);
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
