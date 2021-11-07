/*
API endpoint to copy a path from one project to another (or from public files to
a project) or within a project.

This requires the user to be signed in with appropriate access.

See "@cocalc/server/projects/control/base" for POST params.
*/
import getAccountId from "lib/account/get-account";
import { getProject } from "@cocalc/server/projects/control";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }

  const {
    path,
    src_project_id,
    target_project_id,
    target_path,
    overwrite_newer,
    delete_missing,
    backup,
    timeout,
    bwlimit,
    public_id,
  } = req.body;

  const error = checkParams(req.body);
  if (error) {
    res.json({ error });
    return;
  }

  // const account_id = await getAccountId(req);
  // TODO: (1) check permissions!!!
  // TODO: (2) use public_id to do a security check that source path is contained in the given public path.

  try {
    const project = getProject(src_project_id);
    await project.copyPath({
      path,
      target_project_id,
      target_path,
      overwrite_newer,
      delete_missing,
      backup,
      timeout,
      bwlimit,
      public: !!public_id,
      wait_until_done: true,
    });
    // success means no exception and no error field in response.
    res.json({});
  } catch (err) {
    res.json({ error: `${err}` });
  }
}

function checkParams(obj: any): string | undefined {
  if (obj.path == null) return "path must be specified";
  if (!isValidUUID(obj.src_project_id))
    return "src_project_id must be a valid uuid";
  if (!isValidUUID(obj.target_project_id))
    return "target_project_id must be a valid uuid";
}
