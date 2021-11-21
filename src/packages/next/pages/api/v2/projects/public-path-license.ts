/*
If the given public path is unlisted and has a license associated to it,
apply it to the given project.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import { getProject } from "@cocalc/server/projects/control";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }
  const { public_path_id, project_id } = req.body;

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
      // If necessary, restart project to ensure that license gets applied
      const project = getProject(project_id);
      const { state } = await project.state();
      if (state == "starting" || state == "running") {
        project.restart(); // don't await this -- it could take a long time and isn't necessary to wait for.
      }
    }

    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
