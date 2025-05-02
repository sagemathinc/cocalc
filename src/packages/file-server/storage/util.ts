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
    await sudo({ command: "ls", args: [path] });
    return true;
  } catch {
    return false;
  }
}

export async function mkdirp(paths: string[]) {
  if (paths.length == 0) return;
  await sudo({ command: "mkdir", args: ["-p", ...paths] });
}

export async function chmod(args: string[]) {
  await sudo({ command: "chmod", args: args });
}

export async function sudo(
  opts: ExecuteCodeOptions & { desc?: string },
): Promise<ExecuteCodeOutput> {
  if (opts.verbose !== false && opts.desc) {
    logger.debug("exec", opts.desc);
  }
  return await executeCode({
    verbose: true,
    timeout: DEFAULT_EXEC_TIMEOUT_MS / 1000,
    ...opts,
    command: "sudo",
    args: [opts.command, ...(opts.args ?? [])],
  });
}

export async function rm(paths: string[]) {
  if (paths.length == 0) return;
  await sudo({ command: "rm", args: paths });
}

export async function rmdir(paths: string[]) {
  if (paths.length == 0) return;
  await sudo({ command: "rmdir", args: paths });
}

export async function listdir(path: string) {
  const { stdout } = await sudo({ command: "ls", args: ["-1", path] });
  return stdout.split("\n").filter((x) => x);
}
