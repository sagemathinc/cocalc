/*
Run arbitrary shell command in a project.
DOES check auth
*/

import { projectApiClient } from "@cocalc/conat/project/api";
import { conat } from "@cocalc/backend/conat";
import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

// checks auth and runs code
export default async function exec({
  account_id,
  project_id,
  execOpts,
}: {
  account_id: string;
  project_id: string;
  execOpts: ExecuteCodeOptions;
}): Promise<ExecuteCodeOutput> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }

  const api = projectApiClient({
    client: conat(),
    project_id,
    timeout: execOpts.timeout ? execOpts.timeout * 1000 + 2000 : undefined,
  });
  return await api.system.exec(execOpts);
}
