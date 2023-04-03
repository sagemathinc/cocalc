import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

interface Opts {
  id: string;
  title: string;
  text: string;
  url: string;
  time: Date;
  channel: string;
}

const L = getLogger("server:news:edit").debug;

export default async function editNews(opts: Opts) {
  let { id } = opts;
  const { title, text, url, time, channel } = opts;
  L("editNews", { id, title, url });

  const pool = getPool();

  if (id) {
    await pool.query(
      `UPDATE news SET title=$1, text=$2, url=$3, time=$4, channel=$5 WHERE id=$6`,
      [title, text, url, time, channel, id]
    );
  } else {
    const { rows } = await pool.query(
      `INSERT INTO news (title, text, url, time, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, text, url, time, channel]
    );
    id = rows[0].id;
  }

  // upon success, return what we have created
  return { id, title, text, url, time, channel };
}
