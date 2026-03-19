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
import { getAccountFromApiKey, hasProjectScope } from "@cocalc/server/auth/api";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function handle(req, res) {
  try {
    const { account_id, project_id: project_id0, scope } =
      (await getAccountFromApiKey(req)) ?? {};
    if (!account_id && !project_id0) {
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
      // auth via project-specific API key
      if (project_id0 != project_id) {
        throw Error("project specific api key must match requested project");
      }
    }
    if (account_id) {
      // Enforce OAuth2 project scope (API keys have scope=undefined → unrestricted)
      if (!hasProjectScope(scope, project_id)) {
        throw Error(
          "OAuth2 token does not have project access scope. " +
            "Required: api:project or api:project:" +
            project_id,
        );
      }
      // Collaborator check (applies to both API keys and OAuth2 tokens)
      if (!(await isCollaborator({ account_id, project_id }))) {
        throw Error("user must be a collaborator on the project");
      }
    }
    const resp = await projectBridge({
      project_id,
      compute_server_id,
      name,
      args,
      timeout,
      account_id,
    });
    res.json(resp);
  } catch (err) {
    res.json({ error: err.message });
  }
}
