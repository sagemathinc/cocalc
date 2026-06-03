/*
API endpoint to query the status of a copy_paths row submitted via
/api/v2/projects/copy-path with wait_until_done=false.

The frontend polls this until `finished` is set; then `copy_error` is
either null (success) or contains a human-readable description of what
went wrong on the project pod / manage side. We deliberately use
`copy_error` rather than `error` so the shared apiPost wrapper, which
throws on any top-level `error` field, doesn't conflate "the copy
failed" with "this status request failed" — the caller wants to
distinguish those.

Auth: the requesting account must be a collaborator on the target
project that the copy was directed to. (Anonymous owners count, since
they are the sole collaborator on a freshly-created project they made
via "Use CoCalc Anonymously".)
*/

import getAccountId from "lib/account/get-account";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { isValidUUID } from "@cocalc/util/misc";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const { copy_id } = getParams(req);
  try {
    if (!isValidUUID(copy_id)) {
      throw Error("copy_id must be a valid uuid");
    }
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const pool = getPool("short");
    const { rows } = await pool.query(
      "SELECT target_project_id, started, finished, error FROM copy_paths WHERE id=$1",
      [copy_id],
    );
    if (rows.length === 0) {
      throw Error("copy_id not found");
    }
    const row = rows[0];
    if (
      !(await isCollaborator({
        account_id,
        project_id: row.target_project_id,
      }))
    ) {
      throw Error("must be a collaborator on the target project");
    }
    res.json({
      started: row.started,
      finished: row.finished,
      copy_error: row.error,
    });
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
