import getLogger from "@cocalc/backend/logger";
import type { PostgreSQL } from "../types";
import getPool from "@cocalc/database/pool";
import { callback2 } from "@cocalc/util/async-utils";
import { minutes_ago } from "@cocalc/util/misc";
import { uuidsha1 } from "@cocalc/backend/misc_node";
import { delete_patches } from "../changefeed/delete-patches";

const logger = getLogger("database:blobs");

/*
archivePatches:  Offlines and archives the patches, unless the string is active very recently, in
which case this is a no-op.  This removes all patches from the database for this syncstring and
puts them in a single blob, then stores the id of that blob in the archived field of the syncstrings
table.

TODO: this ignores all syncstrings marked as "huge:true", because the patches are too large.
      come up with a better strategy (incremental?) to generate the blobs to avoid the problem.
*/

export async function archivePatches({
  db,
  string_id,
  compress = "zlib",
  level = -1,
  cutoff = minutes_ago(30),
}: {
  db: PostgreSQL;
  string_id: string;
  compress?: string;
  level?: number;
  cutoff?: Date;
}) {
  const dbg = (...args) => {
    logger.debug("archivePatches", { string_id }, ...args);
  };
  dbg("get syncstring info");
  const pool = getPool();
  const { rows: syncstrings } = await pool.query(
    "SELECT project_id, archived, last_active, huge FROM syncstrings WHERE string_id=$1",
    [string_id],
  );
  if (syncstrings.length == 0) {
    throw Error(`no syncstring with id '${string_id}`);
  }
  const { project_id, archived, last_active, huge } = syncstrings[0];
  if (archived) {
    throw Error(
      `string_id='#{opts.string_id}' already archived as blob id '${archived}'`,
    );
  }
  if (last_active && last_active >= cutoff) {
    dbg("excluding due to cutoff");
    return;
  }
  if (huge) {
    dbg("excluding due to being huge");
    return;
  }
  dbg("get patches");
  const patches = await exportPatches(string_id);
  dbg("create blob from patches");
  let blob;
  try {
    blob = Buffer.from(JSON.stringify({ patches, string_id }));
  } catch (err) {
    // This might happen if the total length of all patches is too big.
    // need to break patches up...
    // This is not exactly the end of the world as the entire point of all this is to
    // just save some space in the database.
    await pool.query("UPDATE syncstrings SET huge=true WHERE string_id=$1", [
      string_id,
    ]);
    return;
  }
  const uuid = uuidsha1(blob);
  dbg("save blob", uuid);
  await callback2(db.save_blob, {
    uuid,
    blob,
    project_id,
    compress,
    level,
  });
  dbg("update syncstring to indicate patches have been archived in a blob");
  await pool.query("UPDATE syncstrings SET archived=$1 WHERE string_id=$2", [
    uuid,
    string_id,
  ]);
  dbg("delete patches");
  await delete_patches({ db, string_id });
}

export async function exportPatches(string_id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM patches WHERE string_id=$1",
    [string_id],
  );
  return rows;
}

