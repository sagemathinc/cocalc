// Execute code on compute server in compute or filesystem container, or in this project.

import {
  handleComputeServerFilesystemExec,
  handleComputeServerComputeExec,
} from "@cocalc/sync-fs/lib/handle-api-call";

import { executeCode } from "@cocalc/backend/execute-code";

import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

export default async function execCode(opts: ExecuteCodeOptions): Promise<ExecuteCodeOutput> {
  if (opts.compute_server_id) {
    if (opts.filesystem) {
      return await handleComputeServerFilesystemExec(opts);
    } else {
      return await handleComputeServerComputeExec(opts);
    }
  } else {
    return await executeCode(opts);
  }
}
