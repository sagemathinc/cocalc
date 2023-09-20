/*
If the given public path is unlisted and has a license associated to it,
apply it to the given project.
*/

import { isValidUUID } from "@cocalc/util/misc";
import { associatedLicense } from "@cocalc/server/licenses/public-path";
import getParams from "lib/api/get-params";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import addLicenseToProject from "@cocalc/server/licenses/add-to-project";

export default async function handle(req, res) {
  const { public_path_id, project_id } = getParams(req);

  try {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    if (public_path_id?.length != 40) {
      throw Error("public_path_id must be a sha1 hash");
    }
    const site_license_id = await associatedLicense(public_path_id);
    if (site_license_id) {
      // These are the only conditions under which we would apply a license.
      // Apply site_license_id to project_id.
      await addLicenseToProject({ project_id, license_id: site_license_id });
      restartProjectIfRunning(project_id);
    }

    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
