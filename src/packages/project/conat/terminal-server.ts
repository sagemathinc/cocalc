import { terminalServer } from "@cocalc/conat/project/terminal";
import { spawn } from "@lydell/node-pty";
import { getIdentity } from "./connection";
import { realpath } from "node:fs/promises";
import { getLogger } from "@cocalc/project/logger";
const logger = getLogger("project:conat:terminal-server");

export function init(opts) {
  opts = getIdentity(opts);
  logger.debug("init", opts);
  terminalServer({
    ...opts,
    spawn,
    cwd,
  });
}

// get current working directory of a process, if possible
// TODO: non-linux?
async function cwd(pid: number): Promise<string | undefined> {
  if (process.env.HOME == null || process.platform != "linux") {
    return;
  }
  // we reply with the current working directory of the underlying terminal process,
  // which is why we use readlink and proc below.
  // [hsy/dev] wrapping in realpath, because I had the odd case, where the project's
  // home included a symlink, hence the "startsWith" below didn't remove the home dir.
  const home = await realpath(process.env.HOME);
  let c;
  try {
    c = await readlink(`/proc/${pid}/cwd`);
  } catch {
    return;
  }
  // try to send back a relative path, because the webapp does not
  // understand absolute paths
  return c.startsWith(home) ? c.slice(home.length + 1) : c;
}
