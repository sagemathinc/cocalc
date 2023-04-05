/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import LRU from "lru-cache";

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const cache = new LRU({ max: 1, ttl: 60 * 1000 });

const L = getLogger("server:news:list").debug;

const Q = `
SELECT
  id, title, text, channel, url,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE date BETWEEN NOW() - '3 months'::interval AND NOW()
  AND hide IS NOT TRUE
ORDER BY date DESC
LIMIT 100`;

export default async function listNews(params: any) {
  L("listNews", params);
  if (cache.has("news")) {
    return cache.get("news");
  }

  const pool = getPool("long");
  const { rows } = await pool.query(Q);
  cache.set("news", rows);
  return rows;
}
