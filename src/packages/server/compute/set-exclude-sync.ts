import getPool from "@cocalc/database/pool";

// this sep is also assumed in cocalc-compute-docker/src/cocalc/start-filesystem.js

const SEP = "|";

export default async function setExcludeSync({
  account_id,
  id,
  exclude, // array of top-level directories to exclude from sync. names must not include "|".  Include "" to disable sync entirely.
}: {
  account_id: string;
  id: number;
  exclude: string[];
}) {
  for (const path of exclude) {
    if (path.includes("/")) {
      throw Error("directories must not include '/'");
    }
    if (path.includes("|")) {
      throw Error("directories must not include '|'");
    }
  }

  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET exclude_from_sync=$1, last_edited=NOW() WHERE id=$2 AND account_id=$3",
    [exclude.join(SEP), id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      "invalid id or attempt to change compute server by a non-owner, which is not allowed.",
    );
  }
}
