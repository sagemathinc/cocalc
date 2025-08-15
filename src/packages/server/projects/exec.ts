/*
Run arbitrarily shell command on compute server or project.
DOES check auth
*/

import { projectApiClient } from "@cocalc/conat/project/api";
import { conat } from "@cocalc/backend/conat";
import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import execOnComputeServer from "@cocalc/server/compute/exec";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

// checks auth and runs code
export default async function exec({
  account_id,
  project_id,
  compute_server_id = 0,
  execOpts,
}: {
  account_id: string;
  project_id: string;
  compute_server_id?: number;
  execOpts: ExecuteCodeOptions;
}): Promise<ExecuteCodeOutput> {
  if (compute_server_id) {
    // do separately because we may have to deny if allow collab control isn't enabled.
    return await execOnComputeServer({
      account_id,
      id: compute_server_id,
      execOpts,
    });
  }

  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }

  const api = projectApiClient({
    client: conat(),
    compute_server_id,
    project_id,
    timeout: execOpts.timeout ? execOpts.timeout * 1000 + 2000 : undefined,
  });
  return await api.system.exec(execOpts);
}
