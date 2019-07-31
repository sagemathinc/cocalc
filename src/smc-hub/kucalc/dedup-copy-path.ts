import { callback2 } from "smc-util/async-utils";
import { seconds_ago } from "smc-util/misc2";

interface Options {
  database: any;
  get_synctable: () => Promise<any>;
  project_id: string;
  path: string;
  target_project_id: string;
  target_path: string;
  dedup_seconds: number;
}

export async function dedup_copy_path(
  opts: Options
): undefined | { error: string } {
  // Query database to see if there is a relevant copy operations already underway (or done)
  const query =
    "SELECT copy_id, finished, error FROM copy_paths WHERE id, error, finished";
  const where = { "time >= $::TIMESTAMP": seconds_ago(opts.dedup_seconds) };
  const result = await callback2(opts.database._query, { query, where });
  if (result == null || result.rows == null) {
    throw Error("invalid result"); // can't happen
  }
  if (result.rows.length === 0) {
    // nothing currently or recently happening, so caller will do the copy as usual.
    return;
  }
  const row = result.rows[0];
  if (row == null) {
    throw Error("bug"); // impossible
  }
  if (row.finished) {
    // yeah, it finished
    return { error: row.error };
  }
  // It's still running so we wait.
  const synctable = await opts.get_synctable();
  const start_time = new Date().valueOf();
  while (1) {
    if (new Date().valueOf() - start_time >= 1000 * 60 * 5) {
      // We've been waiting 5 minutes -- no way this is working.
      // Better to give up than waste time reacting to every
      // change in the synctable.
      throw Error("took too long (timed out after 5 minutes)");
    }
    await once(synctable, "change");
    const cur = synctable.get(row.copy_id);
    if (cur.get("finished")) {
      return { error: cur.get("error") };
    }
  }
}
