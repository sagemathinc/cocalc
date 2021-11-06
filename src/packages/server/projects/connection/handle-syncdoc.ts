/*
Handle a syncdoc history request
*/

import { syncdoc_history } from "@cocalc/util/message";
import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";

interface Options {
  project_id: string;
  mesg;
  sendResponse: (any) => void;
}

export default async function handleSyncdoc({
  project_id,
  mesg,
  sendResponse,
}: Options) {
  const { patches, string_id } = mesg;
  // this raises an error if user does not have access
  await checkSyncdocAccess(project_id, string_id);
  // get the history
  const history = await db().syncdoc_history_async(string_id, patches);
  sendResponse(syncdoc_history({ history }));
}

async function checkSyncdocAccess(project_id, string_id): Promise<void> {
  if (typeof string_id != "string" && string_id.length == 40) {
    throw Error("invalid string_id");
  }
  const pool = getPool("long"); // caching is fine since a "no" result isn't cached and a yes result doesn't change.
  const { rows } = await pool.query(
    "SELECT project_id FROM syncstrings WHERE string_id = $1::CHAR(40)",
    [string_id]
  );
  if (rows.length == 0) {
    throw Error("no such syncdoc");
  }
  if (rows[0].project_id != project_id) {
    throw Error("project does NOT have access to this syncdoc");
  }
  // everything is fine -- nothing more to do
}
