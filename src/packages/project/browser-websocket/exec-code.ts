// Execute code on compute server in compute or filesystem container, or in this project.

import { executeCode } from "@cocalc/backend/execute-code";

import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

export default async function execCode(
  opts: ExecuteCodeOptions,
): Promise<ExecuteCodeOutput> {
  if (opts.compute_server_id) {
    throw Error("deprecated");
  } else {
    return await executeCode(opts);
  }
}
