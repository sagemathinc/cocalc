/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { NewsType } from "@cocalc/util/types/news";
import dayjs from "dayjs";

const L = getLogger("server:news:edit").debug;

export default async function editNews(opts: NewsType) {
  let { id } = opts;
  const { title, text, url, date, channel, hide } = opts;

  const pool = getPool();

  if (id) {
    L("editNews/update", { id, title, url, text, date, channel, hide });

    // take the title, text, url, date and channel value from the existing item
    // and save it with the unix epoch time as the key in the history map.
    // this way we can keep a history of changes to the news item.
    const existing = (
      await pool.query(
        `SELECT title, text, url, date, channel, history FROM news WHERE id=$1`,
        [id]
      )
    ).rows[0];
    const history = existing.history ?? {};
    history[dayjs().unix()] = {
      title: existing.title,
      text: existing.text,
      url: existing.url,
      date: existing.date,
      channel: existing.channel,
      hide: existing.hide,
    };
    await pool.query(
      `UPDATE news SET title=$1, text=$2, url=$3, date=$4, channel=$5, hide=$6, history=$7 WHERE id=$8`,
      [title, text, url, date, channel, hide, history, id]
    );
  } else {
    L("editNews/insert", { id, title, url, text, date, channel, hide });
    const { rows } = await pool.query(
      `INSERT INTO news (title, text, url, date, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, text, url, date, channel]
    );
    id = rows[0].id;
  }

  // upon success, return id
  return { id };
}
