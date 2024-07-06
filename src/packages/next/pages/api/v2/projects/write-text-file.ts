/* Write a text file to a project. */

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { isValidUUID } from "@cocalc/util/misc";
import callProject from "@cocalc/server/projects/call";
import { OkStatus } from "lib/api/status";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    if (account_id == null) throw Error("must be authenticated");
    const { project_id, path, content } = getParams(req);
    if (!isValidUUID(project_id))
      throw Error("must set project_id to a valid uuid");
    if (!path) throw Error("must specify a 'path'");
    if (content == null) throw Error("must include content of file");
    await callProject({
      account_id,
      project_id,
      mesg: {
        event: "write_text_file_to_project",
        path,
        content,
      },
    });
    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}
