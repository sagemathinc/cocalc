import {
  type ExecuteCodeOptions,
  type ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:storage:util");

const DEFAULT_EXEC_TIMEOUT_MS = 60 * 1000;

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
  let command, args;
  if (opts.bash) {
    command = `sudo ${opts.command}`;
    args = undefined;
  } else {
    command = "sudo";
    args = [opts.command, ...(opts.args ?? [])];
  }
  return await executeCode({
    verbose: true,
    timeout: DEFAULT_EXEC_TIMEOUT_MS / 1000,
    ...opts,
    command,
    args,
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
