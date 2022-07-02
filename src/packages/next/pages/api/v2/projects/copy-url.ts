/*
API endpoint to copy from a URL on the internet to a project.

This requires the user to be signed in with appropriate access to the project.

If project doesn't have network access, we stop the project, start it with
network access, get the content, then restart the project without network access.
*/

import getAccountId from "lib/account/get-account";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getParams from "lib/api/get-params";
import call from "@cocalc/server/projects/connection/call";
import getProxiedPublicPathInfo from "lib/share/proxy/get-proxied-public-path-info";
import { getProject } from "@cocalc/server/projects/control";

export default async function handle(req, res) {
  const params = getParams(req, ["project_id", "url", "path", "timeout"]);
  const error = checkParams(params);
  if (error) {
    res.json({ error });
    return;
  }
  const {
    project_id,
    url, // the supported schema is as in next/lib/share/proxy/get-public-path.ts).
    path, // where to write the contents of the url
  } = params;

  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    if (!isCollaborator({ account_id, project_id })) {
      throw Error("must be a collaborator on target project");
    }

    const info = await getProxiedPublicPathInfo(url);
    if (info.contents?.content == null) {
      throw Error(
        "copying of directories (e.g., GitHub repos) is not implemented"
      );
    }
    const i = url.lastIndexOf("/");
    const filename = url.slice(i + 1);
    const mesg = {
      event: "write_text_file_to_project",
      path: path ? path : filename,
      content: info.contents.content,
    };
    try {
      const response = await call({ project_id, mesg });
      res.json({ response });
    } catch (_err) {
      // ensure project running and try again.
      const project = getProject(project_id);
      await project.start();
      const response = await call({ project_id, mesg });
      res.json({ response });
    }
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}

function checkParams(obj: any): string | undefined {
  if (!obj.url) return "url must be specified";
  if (!isValidUUID(obj.project_id)) return "project_id must be a valid uuid";
}
