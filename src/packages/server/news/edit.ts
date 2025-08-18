/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { omit } from "lodash";

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { clearCache } from "@cocalc/database/postgres/news";
import type { NewsItem } from "@cocalc/util/types/news";

const L = getLogger("server:news:edit").debug;

export default async function editNews(opts: NewsItem) {
  let { id } = opts;
  const { title, text, url, date, channel, hide, tags, until } = opts;

  // we do this operation without touching any caches
  const pool = getPool();

  if (id) {
    L("editNews/update", { id, title, url, text, date, channel, tags, hide, until });

    // take the title, text, url, date and channel value from the existing item
    // and save it with the unix epoch time as the key in the history map.
    // this way we can keep a history of changes to the news item.
    const existing = (
      await pool.query(
        `SELECT title, text, url, date, channel, tags, until, history FROM news WHERE id=$1`,
        [id]
      )
    ).rows[0];
    const history = existing.history ?? {};
    history[dayjs().unix()] = omit(existing, ["id", "history"]);
    await pool.query(
      `UPDATE news SET title=$1, text=$2, url=$3, date=$4, channel=$5, tags=$6, hide=$7, until=$8, history=$9 WHERE id=$10`,
      [title, text, url, date, channel, tags, hide, until, history, id]
    );
  } else {
    L("editNews/insert", { id, title, url, text, date, channel, tags, hide, until });
    const { rows } = await pool.query(
      `INSERT INTO news (title, text, url, date, channel, tags, until) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title, text, url, date, channel, tags, until]
    );
    id = rows[0].id;
  }

  // upon success: clear cache and return id
  clearCache();
  return { id };
}
