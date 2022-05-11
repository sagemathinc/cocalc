/* Write a text file to a project. */

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { isValidUUID } from "@cocalc/util/misc";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    if (account_id == null) throw Error("must be authenticated");
    const { project_id, path, content } = getParams(req, [
      "project_id",
      "path",
      "content",
    ]);
    if (!isValidUUID(project_id))
      throw Error("must set project_id to a valid uuid");
    if (!path) throw Error("must specify a 'path'");
    if (content == null) throw Error("must include content of file");
    throw Error("NotImplementedError");
    //await writeTextFileToProject({ account_id, project_id, path, content });
    res.json({ status: "ok" });
  } catch (err) {
    res.json({ error: err.message });
  }
}
