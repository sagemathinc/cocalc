/*
Get information about this user's activity to help them
better find things.
*/

import getAccountId from "lib/account/get-account";
import getPool from "@cocalc/database/pool";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const account_id = await getAccountId(req);
  if (account_id == null) {
    // no usage to list, since not signed in.
    res.json({ files: [] });
    return;
  }

  let { interval } = req.body;

  try {
    const files = await fileAccess({ account_id, interval });
    res.json({ files });
  } catch (err) {
    res.json({ error: `${err}` });
  }
}

interface Access {
  project_id: string;
  title: string;
  path: string;
}

async function fileAccess({ account_id, interval }): Promise<Access[]> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT DISTINCT file_access_log.filename AS path, file_access_log.project_id AS project_id, projects.title AS title FROM file_access_log, projects WHERE file_access_log.project_id=projects.project_id  AND file_access_log.time >= NOW() - $2::interval AND file_access_log.account_id=$1 ORDER BY title,path",
    [account_id, interval ? interval : "1 day"]
  );
  return rows;
}
