/*
Execute code on a compute server.
*/

import callProject from "@cocalc/server/projects/call";
import { getServer } from "./get-servers";
import type { ExecOpts } from "@cocalc/util/db-schema/projects";

// Run exec
export default async function exec({
  account_id,
  id,
  execOpts,
}: {
  account_id: string;
  id: number;
  execOpts: Partial<ExecOpts>;
}) {
  const server = await getServer({ account_id, id });

  return await callProject({
    account_id,
    project_id: server.project_id,
    mesg: {
      ...execOpts,
      event: "project_exec",
      compute_server_id: id,
      project_id: server.project_id,
    },
  });
}
