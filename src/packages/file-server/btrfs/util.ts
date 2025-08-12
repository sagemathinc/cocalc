import {
  type ExecuteCodeOptions,
  type ExecuteCodeOutput,
} from "@cocalc/util/types/execute-code";
import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";
import { stat } from "node:fs/promises";

const logger = getLogger("file-server:storage:util");

const DEFAULT_EXEC_TIMEOUT_MS = 60 * 1000;

export async function mkdirp(paths: string[]) {
  if (paths.length == 0) return;
  await sudo({ command: "mkdir", args: ["-p", ...paths] });
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

export async function btrfs(
  opts: Partial<ExecuteCodeOptions & { desc?: string }>,
) {
  return await sudo({ ...opts, command: "btrfs" });
}

export async function isDir(path: string) {
  return (await stat(path)).isDirectory();
}

export function parseBupTime(s: string): Date {
  const [year, month, day, time] = s.split("-");
  const hours = time.slice(0, 2);
  const minutes = time.slice(2, 4);
  const seconds = time.slice(4, 6);

  return new Date(
    Number(year),
    Number(month) - 1, // JS months are 0-based
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
}

export async function ensureMoreLoopbackDevices() {
  // to run tests, this is helpful
  //for i in $(seq 8 63); do sudo mknod -m660 /dev/loop$i b 7 $i; sudo chown root:disk /dev/loop$i; done
  for (let i = 0; i < 64; i++) {
    try {
      await stat(`/dev/loop${i}`);
      continue;
    } catch {}
    try {
      // also try/catch this because ensureMoreLoops happens in parallel many times at once...
      await sudo({
        command: "mknod",
        args: ["-m660", `/dev/loop${i}`, "b", "7", `${i}`],
      });
    } catch {}
    await sudo({ command: "chown", args: ["root:disk", `/dev/loop${i}`] });
  }
}
