/*
If the given public path is unlisted and has a license associated to it,
apply it to the given project.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import getParams from "lib/api/get-params";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";

export default async function handle(req, res) {
  const { public_path_id, project_id } = getParams(req);

  try {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    if (public_path_id?.length != 40) {
      throw Error("public_path_id must be a sha1 hash");
    }

    const pool = getPool("short");
    const { rows } = await pool.query(
      "SELECT site_license_id, disabled, unlisted FROM public_paths WHERE id=$1",
      [public_path_id]
    );
    const { disabled, unlisted, site_license_id } = rows[0] ?? {};
    if (site_license_id && !disabled && unlisted) {
      // These are the only conditions under which we would apply a license.
      // Apply site_license_id to project_id.
      await db().add_license_to_project(project_id, site_license_id);
      restartProjectIfRunning(project_id);
    }

    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
