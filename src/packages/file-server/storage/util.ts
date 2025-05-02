import {
  type ExecuteCodeOptions,
  type ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";

const DEFAULT_EXEC_TIMEOUT_MS = 60 * 1000;

const logger = getLogger("file-server:storage:util");

export async function exists(path: string) {
  try {
    await exec({ command: "sudo", args: ["ls", path] });
    return true;
  } catch {
    return false;
  }
}

export async function mkdirp(paths: string[]) {
  await exec({ command: "sudo", args: ["mkdir", "-p", ...paths] });
}

export async function chmod(args: string[]) {
  await exec({ command: "sudo", args: ["chmod", ...args] });
}

export async function exec(
  opts: ExecuteCodeOptions & { desc?: string },
): Promise<ExecuteCodeOutput> {
  if (opts.verbose !== false && opts.desc) {
    logger.debug("exec", opts.desc);
  }
  return await executeCode({
    verbose: true,
    timeout: DEFAULT_EXEC_TIMEOUT_MS / 1000,
    ...opts,
  });
}
