import getLogger from "@cocalc/backend/logger";
import type { PostgreSQL } from "./types";
import getPool from "@cocalc/database/pool";
import { callback2 } from "@cocalc/util/async-utils";
import { minutes_ago } from "@cocalc/util/misc";
import { uuidsha1 } from "@cocalc/backend/misc_node";
import { delete_patches } from "./delete-patches";

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

export async function unarchivePatches({
  db,
  string_id,
}: {
  db: PostgreSQL;
  string_id: string;
}) {
  const dbg = (...args) => {
    logger.debug("unarchivePatches", { string_id }, ...args);
  };
  dbg();

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT archived, project_id, path, last_active FROM syncstrings WHERE string_id=$1",
    [string_id],
  );
  if (rows.length == 0) {
    throw Error(`no syncstring with id ${string_id}`);
  }
  const uuid = rows[0].archived;
  if (!uuid) {
    dbg("it is not archived");
    return;
  }
  dbg("download blob");
  let blob;
  let error = "";
  try {
    blob = await callback2(db.get_blob, { uuid });
  } catch (err) {
    dbg(`WARNING -- unable to get blob with id ${uuid}`, err);
    blob = null;
    error = `${err}`;
  }
  if (blob == null) {
    // We always use the empty history in this case for older ones, since that is better than
    // denying access.
    blob = "[]";
    if (rows[0].last_active >= new Date("2025-01-20")) {
      // no blob -- for older ones this would happen if two syncstrings had the same exact
      // edit history, which was very rare except for the empty history.
      // This is fixed for all newly archived syncstring blobs, so if it happens,
      // then we need to know.
      if (db.adminAlert != null) {
        dbg("NONFATAL ERROR -- blob is GONE!");
        // Instead of giving up, we basically give up on the syncstring history, and also
        // send a message to admins to look into it.  This is better than completely blocking
        // access to the file to the user, especially since they have the file on disk along
        // with filesystem snapshots.  Also this *should* never happen.  I'm writing this because
        // I switched .compute-servers.syncdb between ephemeral and not, which seems to have
        // broken some of these, and I think we also hit this once or twice before.
        await db.adminAlert({
          subject: `missing TimeTravel history for path='${rows[0].path}'`,
          body: `The blob with TimeTravel history for editing path='${rows[0].path}' is missing.
Instead of breaking things for the user, things might work, but with the history reset.  That said,
an admin should look into this since the bug that could cause this should be fixed.

- project_id='${rows[0].project_id}'

- path='${rows[0].path}'

- string_id='${string_id}'

- error='${error}'
`,
        });
      }
    }
  } else {
    dbg("extract blob");
    const x = JSON.parse(blob);
    // we changed the format in Jan 2025 so instead of just storing the patches as
    // an array [patch0,patch1,...] we store an object {string_id:'...', patches:[patch0,patch1,...]}
    // This way two different syncstrings have different blobs.  Otherwise, if two syncstrings have
    // the exact same history, then when you extract and delete one, the other history is just lost!
    // This will happen with older histories, but is rare except for the empty history... which is
    // of course easy to treat as a special case.
    let patches;
    if (x?.patches) {
      patches = x.patches;
    } else {
      patches = x;
    }
    await callback2(db.import_patches, { patches });
  }

  dbg("update syncstring to indicate that patches are now available");
  await pool.query("UPDATE syncstrings SET archived=NULL WHERE string_id=$1", [
    string_id,
  ]);
  if (blob != null) {
    // see comment about deleting blob above.
    dbg("delete blob, which is now no longer needed");
    await callback2(db.delete_blob, { uuid });
  }
}
