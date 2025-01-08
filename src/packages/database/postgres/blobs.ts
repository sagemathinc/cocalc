import getLogger from "@cocalc/backend/logger";
import type { PostgreSQL } from "./types";
import getPool from "@cocalc/database/pool";
import { callback2 } from "@cocalc/util/async-utils";

const logger = getLogger("database:blobs");

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
    "SELECT archived, project_id, path FROM syncstrings WHERE string_id=$1",
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
    if (db.adminAlert != null) {
      // having .compute-server.syncdb missing doesn't matter at all, since we don't care
      // about that history
      if (rows[0].path != ".compute-server.syncdb") {
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
an admin should look into this.

- project_id='${rows[0].project_id}'

- path='${rows[0].path}'

- string_id='${string_id}'

- error='${error}'
`,
        });
      }
    } else {
      // can't even alert admins
      dbg("FATAL ERROR -- blob is gone (unable to alert admins)");
      throw Error("blob is gone");
    }
  } else {
    dbg("extract blob");
    const patches = JSON.parse(blob);
    await callback2(db.import_patches, { patches });
  }

  dbg("update syncstring to indicate that patches are now available");
  await pool.query("UPDATE syncstrings SET archived=NULL WHERE string_id=$1", [
    string_id,
  ]);
  if (blob != null) {
    dbg("delete blob, which is now no longer needed");
    await callback2(db.delete_blob, { uuid });
  }
}
