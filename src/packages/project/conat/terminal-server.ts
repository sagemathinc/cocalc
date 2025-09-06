import { terminalServer, type Options } from "@cocalc/conat/project/terminal";
import { spawn } from "@lydell/node-pty";
import { getIdentity } from "./connection";
import { readlink, realpath } from "node:fs/promises";
import { getLogger } from "@cocalc/project/logger";
import { SpoolWatcher } from "@cocalc/backend/spool-watcher";
import { data } from "@cocalc/backend/data";
import { randomId } from "@cocalc/conat/names";
import { join } from "path";
import { debounce } from "lodash";

const logger = getLogger("project:conat:terminal-server");

export function init(opts) {
  opts = getIdentity(opts);
  logger.debug("init", opts);
  terminalServer({
    ...opts,
    spawn,
    cwd,
    preHook,
    postHook,
  });
}

async function preHook({ options }: { options: Options }) {
  if (options.env0) {
    for (const key in options.env0) {
      options.env0[key] = options.env0[key].replace(
        /\$HOME/g,
        process.env.HOME ?? "",
      );
    }
  }
  if (options.env0?.COCALC_CONTROL_DIR != null) {
    options.env0.COCALC_CONTROL_DIR = join(data, "terminal", randomId());
  }
  return options;
}

async function postHook({ options, pty }) {
  const spoolDir = options?.env?.COCALC_CONTROL_DIR;
  if (!spoolDir) {
    return;
  }
  const messageSpool = new SpoolWatcher(spoolDir, async (payload) => {
    pty.emit("broadcast", "user-command", payload);
  });
  pty.once("exit", () => {
    messageSpool.close();
  });
  await messageSpool.start();

  if (process.platform == "linux" && process.env.HOME != null) {
    let cur: string | undefined = "";
    pty.on(
      "data",
      debounce(
        async () => {
          try {
            const c = await cwd(pty.pid);
            if (c != cur) {
              cur = c;
              pty.emit("broadcast", "update-cwd", cur);
            }
          } catch {}
        },
        250,
        { leading: true, trailing: true },
      ),
    );
  }
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
