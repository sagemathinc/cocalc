/*
This is a bridge to call the Conat rpc api that is offered by projects.
This is meant to be called by either a user account or a project, so API
keys that resolves to either work.

For security reasons this is ONLY usable via an API key -- using an account
is not allowed, since that opens us to XSS attacks.

Here is an example of how this would be used:

key=sk-...02

curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{TODO}' \
   http://localhost:9000/api/conat/project

The api is defined in packages/conat/project/api/
*/

import projectBridge from "@cocalc/server/api/project-bridge";
import getParams from "lib/api/get-params";
import { getAccountFromApiKey } from "@cocalc/server/auth/api";

export default async function handle(req, res) {
  try {
    const { account_id, project_id: project_id0 } =
      (await getAccountFromApiKey(req)) ?? {};
    if (!account_id && !project_id) {
      throw Error("must sign in as project or account");
    }
    const {
      project_id = project_id0,
      compute_server_id,
      name,
      args,
      timeout,
    } = getParams(req);
    if (!project_id) {
      throw Error("must specify project_id or use project-specific api key");
    }
    if (project_id0) {
      // auth via project_id
      if (project_id0 != project_id) {
        throw Error("project specific api key must match requested project");
      }
    }
    if (account_id) {
      // auth via account_id
      if(!await )
    }
    const resp = await projectBridge({
      project_id,
      compute_server_id,
      name,
      args,
      timeout,
    });
    res.json(resp);
  } catch (err) {
    res.json({ error: err.message });
  }
}
