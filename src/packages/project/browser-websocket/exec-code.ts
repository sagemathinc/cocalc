// Execute code in this project.

import { executeCode } from "@cocalc/backend/execute-code";

import type {
  ExecuteCodeOptions,
  ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";

export default async function execCode(
  opts: ExecuteCodeOptions,
): Promise<ExecuteCodeOutput> {
  return await executeCode(opts);
}
