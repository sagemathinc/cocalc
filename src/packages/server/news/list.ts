import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";

const L = getLogger("server:news:list").debug;

export default async function listNews(params: any) {
  L("listNews", params);
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT id, time, title, text, url
      FROM news
      WHERE time >= NOW() - '3 months'::interval
      ORDER BY time DESC
      LIMIT 100`
  );

  return rows;
}
