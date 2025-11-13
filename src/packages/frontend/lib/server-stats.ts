/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";
import LRU from "lru-cache";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

type Stats = {
  running_projects?: { free?: number };
};

const statsCache = new LRU<"stats", Stats>({ max: 1, ttl: 1000 * 60 * 5 });

// ATTN: this might throw an exception
export const getServerStatsCached = reuseInFlight(async (): Promise<Stats> => {
  const stats = statsCache.get("stats");
  if (stats != null) return stats;

  const statsRaw = await fetch(join(appBasePath, "stats"));
  const nextStats = await statsRaw.json();
  statsCache.set("stats", nextStats);

  return nextStats;
});
