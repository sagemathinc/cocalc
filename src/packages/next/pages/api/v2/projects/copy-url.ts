/*
API endpoint to copy from a URL on the internet to a project.

This requires the user to be signed in with appropriate access to the project.

This grabs one file, reads it into memory, then writes it to disk in the project.
*/

import getAccountId from "lib/account/get-account";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getParams from "lib/api/get-params";
import getProxiedPublicPathInfo from "lib/share/proxy/get-proxied-public-path-info";
import { conat } from "@cocalc/backend/conat";

export default async function handle(req, res) {
  const params = getParams(req);
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
    if (!(await isCollaborator({ account_id, project_id }))) {
      throw Error("must be a collaborator on target project");
    }
    const info = await getProxiedPublicPathInfo(url);
    if (info.contents?.content == null) {
      throw Error(
        "copying of directories (e.g., full GitHub repos) is not implemented; copy an individual file instead",
      );
    }
    const i = url.lastIndexOf("/");
    const filename = url.slice(i + 1);
    const fs = conat().fs({ project_id });
    await fs.writeFile(path ? path : filename, info.contents.content);
    res.json({});
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}

function checkParams(obj: any): string | undefined {
  if (!obj.url) return "url must be specified";
  if (!isValidUUID(obj.project_id)) return "project_id must be a valid uuid";
}
