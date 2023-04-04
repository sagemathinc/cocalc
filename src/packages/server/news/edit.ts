import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { NewsType } from "@cocalc/util/types/news";

const L = getLogger("server:news:edit").debug;

export default async function editNews(opts: NewsType) {
  let { id } = opts;
  const { title, text, url, date, channel } = opts;
  L("editNews", { id, title, url, text, date, channel });

  if (1 == 1) return;

  const pool = getPool();

  if (id) {
    await pool.query(
      `UPDATE news SET title=$1, text=$2, url=$3, date=$4, channel=$5 WHERE id=$6`,
      [title, text, url, date, channel, id]
    );
  } else {
    const { rows } = await pool.query(
      `INSERT INTO news (title, text, url, date, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, text, url, date, channel]
    );
    id = rows[0].id;
  }

  // upon success, return what we have created
  return { id, title, text, url, date, channel };
}
