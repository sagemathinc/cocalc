/*
API endpoint to copy a path from one project to another (or from public files to
a project) or within a project.

This requires the user to be signed in with appropriate access.

See "@cocalc/server/projects/control/base" for POST params.
*/
import getAccountId from "lib/account/get-account";
import { getProject } from "@cocalc/server/projects/control";
import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

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

  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    if (!isCollaborator({ account_id, project_id: target_project_id })) {
      throw Error("must be a collaborator on target project");
    }
    if (public_id) {
      // Verify that path is contained in the public path with id public_id:
      if (
        !(await isContainedInPublicPath({
          id: public_id,
          project_id: src_project_id,
          path,
        }))
      ) {
      }
    } else {
      if (!isCollaborator({ account_id, project_id: src_project_id })) {
        throw Error("must be a collaborator on source project");
      }
    }
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

async function isContainedInPublicPath({ id, project_id, path }) {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT project_id, path FROM public_paths WHERE disabled IS NOT TRUE AND vhost IS NULL AND id=$1",
    [id]
  );
  return (
    rows.length > 0 &&
    rows[0].project_id == project_id &&
    path.startsWith(rows[0].path)
  );
}
