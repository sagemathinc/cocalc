/*

EXAMPLE:

~$ curl   -u `cat .smc/secret_token`: -d path=a.md http://127.0.0.1:`cat .smc/api-server.port`/api/v1/get-syncdoc-history -d patches | python -m json.tool

If you get an error about no hubs connected, then edit a file in the project
in a browser to cause a connection to happen.   Also, a.md need to be a file that
you have edited.
*/

import { client_db } from "@cocalc/util/db-schema";
import { client } from "./server";
import { syncdbPath } from "@cocalc/util/jupyter/names";

export default async function getSyncdocHistory({
  path,
  patches,
}): Promise<any> {
  const dbg = client.dbg("get-syncdoc-history");
  dbg(`path="${path}"`);
  if (typeof path != "string") {
    throw Error("provide the path as a string");
  }

  // transform jupyter path -- TODO: this should
  // be more centralized... since this is brittle.
  if (path.endsWith(".ipynb")) {
    path = syncdbPath(path);
  }

  // compute the string_id
  const string_id = client_db.sha1(client.project_id, path);
  return await client.get_syncdoc_history(string_id, !!patches);
}
