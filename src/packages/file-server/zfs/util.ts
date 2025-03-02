import { executeCode } from "@cocalc/backend/execute-code";
import { DEFAULT_EXEC_TIMEOUT_MS } from "./config";

export async function exec(opts) {
  return await executeCode({
    ...opts,
    timeout: DEFAULT_EXEC_TIMEOUT_MS / 1000,
  });
}
