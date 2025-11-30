/*
Execute code on a compute server.
*/

import { projectApiClient } from "@cocalc/conat/project/api";
import { conat } from "@cocalc/backend/conat";
import { getServer } from "./get-servers";
import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";

// Run exec
export default async function exec({
  account_id,
  id,
  execOpts,
}: {
  account_id: string;
  id: number;
  execOpts: ExecuteCodeOptions;
}): Promise<ExecuteCodeOutput> {
  const server = await getServer({ account_id, id });
  const api = projectApiClient({
    client: conat(),
    compute_server_id: id,
    project_id: server.project_id,
    timeout: execOpts.timeout ? execOpts.timeout * 1000 + 2000 : undefined,
  });
  return await api.system.exec(execOpts);
}
