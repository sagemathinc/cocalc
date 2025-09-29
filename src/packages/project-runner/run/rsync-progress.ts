import { spawn } from "node:child_process";
import { split, trunc_middle } from "@cocalc/util/misc";
import { once } from "events";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:run:rsync-progress");

const MAX_UPDATES_PER_SECOND = 3;

export default async function rsyncProgress({
  name,
  args,
  progress,
}: {
  // if name is given, run in the podman container with given
  // name; otherwise runs rsync directly.
  name?: string;
  args: string[];
  progress: (event) => void;
}) {
  progress({ progress: 0 });
  const args1: string[] = [];
  let command;
  if (name) {
    command = "podman";
    args1.push("exec", name, "rsync");
  } else {
    command = "rsync";
  }
  args1.push(
    "--outbuf=L",
    "--no-inc-recursive",
    "--info=progress2",
    "--no-human-readable",
  );
  logger.debug(
    "rsyncProgress:",
    `"${command} ${args1.concat(args).join(" ")}"`,
  );
  await rsyncProgressRunner({ command, args: args1.concat(args), progress });
}

// we also use this for other commands that have the exact rsync output when they run...
export async function rsyncProgressRunner({ command, args, progress }) {
  logger.debug(`${command} ${args.join(" ")}`);
  const child = spawn(command, args);

  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  let last = 0;
  let lastTime = Date.now();
  child.stdout.on("data", (data) => {
    let time = Date.now();
    if (time - lastTime <= 1000 / MAX_UPDATES_PER_SECOND) {
      return;
    }
    const v = split(data.toString());
    if (v[1]?.endsWith("%")) {
      const p = parseInt(v[1].slice(0, -1));
      if (isFinite(p) && p > last) {
        progress({ progress: p, speed: v[2], eta: parseEta(v[3]) });
        last = p;
        lastTime = time;
      }
    }
  });
  await once(child, "close");
  if (child.exitCode) {
    logger.debug("rsyncProgress errors", trunc_middle(stderr));
    progress({ error: `there were errors -- ${trunc_middle(stderr)}` });
    throw Error(`error syncing files -- ${trunc_middle(stderr)}`);
  } else {
    progress({ progress: 100 });
  }
}

function parseEta(s?: string) {
  if (s == null) {
    return;
  }
  const i = s?.indexOf(":");
  if (i == -1) return;
  const j = s?.lastIndexOf(":");
  return (
    parseInt(s.slice(0, i)) * 1000 * 60 * 60 +
    parseInt(s.slice(i + 1, j)) * 1000 * 60 +
    parseInt(s.slice(j + 1)) * 1000
  );
}
