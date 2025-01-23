/*
Terminal

- using NATS
*/

import { spawn } from "node-pty";
import { envForSpawn } from "@cocalc/backend/misc";
import { path_split } from "@cocalc/util/misc";
import { console_init_filename, len } from "@cocalc/util/misc";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { project_id } from "@cocalc/project/data";
import { sha1 } from "@cocalc/backend/sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { JSONCodec } from "nats";
import { jetstreamManager } from "@nats-io/jetstream";
import { getLogger } from "@cocalc/project/logger";
import { readlink, realpath } from "node:fs/promises";

const logger = getLogger("server:nats:terminal");

const DEFAULT_KEEP = 300;
const MIN_KEEP = 5;
const MAX_KEEP = 2000;
const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";
const DEFAULT_COMMAND = "/bin/bash";
const INFINITY = 999999;

const jc = JSONCodec();

const sessions: { [name: string]: Session } = {};

export const createTerminal = reuseInFlight(
  async ({ params, nc }: { params; nc }) => {
    if (params == null) {
      throw Error("params must be specified");
    }
    const { path, ...options } = params;
    if (!path) {
      throw Error("path must be specified");
    }
    if (sessions[path] == null) {
      sessions[path] = new Session({ path, options, nc });
      await sessions[path].init();
    }
    return { subject: sessions[path].subject };
  },
  {
    createKey: (args) => {
      return args[0]?.params?.path ?? "";
    },
  },
);

export async function writeToTerminal({ data, path }: { data; path }) {
  const terminal = sessions[path];
  if (terminal == null) {
    throw Error(`no terminal session '${path}'`);
  }
  await terminal.write(data);
  return { success: true };
}

export async function restartTerminal({ path }: { path }) {
  const terminal = sessions[path];
  if (terminal == null) {
    throw Error(`no terminal session '${path}'`);
  }
  await terminal.restart();
  return { success: true };
}

export async function terminalCommand({ path, cmd, ...args }) {
  logger.debug("terminalCommand", { path, cmd, args });
  const terminal = sessions[path];
  if (terminal == null) {
    throw Error(`no terminal session '${path}'`);
  }
  switch (cmd) {
    case "size":
      return terminal.setSize(args as any);
    case "cwd":
      return await terminal.getCwd();
    default:
      throw Error(`unknown cmd="${cmd}"`);
  }
}

class Session {
  private nc;
  private path: string;
  private options;
  private pty?;
  private size?: { rows: number; cols: number };
  // the subject where we publish our output
  public subject: string;
  private state: "running" | "off" = "off";
  private streamName: string;
  private keep: number;

  constructor({ path, options, nc }) {
    logger.debug("create session ", { path, options });
    this.nc = nc;
    this.path = path;
    this.options = options;
    this.keep = Math.max(
      MIN_KEEP,
      Math.min(this.options.keep ?? DEFAULT_KEEP, MAX_KEEP),
    );
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
    this.streamName = `project-${project_id}-terminal`;
  }

  write = async (data) => {
    if (this.state == "off") {
      await this.restart();
    }
    this.pty?.write(data);
  };

  restart = async () => {
    this.pty?.destroy();
    delete this.pty;
    await this.init();
  };

  private getHome = () => {
    return process.env.HOME ?? "/home/user";
  };

  getCwd = async () => {
    if (this.pty == null) {
      return;
    }
    // we reply with the current working directory of the underlying terminal process,
    // which is why we use readlink and proc below.
    const pid = this.pty.pid;
    // [hsy/dev] wrapping in realpath, because I had the odd case, where the project's
    // home included a symlink, hence the "startsWith" below didn't remove the home dir.
    const home = await realpath(this.getHome());
    const cwd = await readlink(`/proc/${pid}/cwd`);
    // try to send back a relative path, because the webapp does not
    // understand absolute paths
    const path = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
    return path;
  };

  getStream = async () => {
    // idempotent so don't have to check if there is already a stream
    const nc = this.nc;
    const jsm = await jetstreamManager(nc);
    try {
      await jsm.streams.add({
        name: this.streamName,
        subjects: [`project.${project_id}.terminal.>`],
        compression: "s2",
        max_msgs_per_subject: this.keep,
      });
    } catch (_err) {
      // probably already exists
      await jsm.streams.update(this.streamName, {
        subjects: [`project.${project_id}.terminal.>`],
        compression: "s2" as any,
        max_msgs_per_subject: this.keep,
      });
    }
  };

  init = async () => {
    const { head, tail } = path_split(this.path);
    const env = {
      COCALC_TERMINAL_FILENAME: tail,
      ...envForSpawn(),
      ...this.options.env,
      TMUX: undefined, // ensure not set
    };
    const command = this.options.command ?? DEFAULT_COMMAND;
    const args = this.options.args ?? [];
    const initFilename: string = console_init_filename(this.path);
    if (await exists(initFilename)) {
      args.push("--init-file");
      args.push(path_split(initFilename).tail);
    }
    const cwd = getCWD(head, this.options.cwd);
    logger.debug("creating pty with size", this.size);
    this.pty = spawn(command, args, {
      cwd,
      env,
      rows: this.size?.rows,
      cols: this.size?.cols,
    });
    this.state = "running";
    await this.getStream();
    this.pty.onData(async (data) => {
      this.nc.publish(this.subject, jc.encode({ data }));
    });
    this.pty.onExit((status) => {
      this.nc.publish(this.subject, jc.encode({ data: EXIT_MESSAGE }));
      this.nc.publish(this.subject, jc.encode({ ...status, exit: true }));
      this.state = "off";
    });
  };

  private clientSizes = {};

  setSize = ({
    client,
    rows,
    cols,
  }: {
    client: string;
    rows: number;
    cols: number;
  }) => {
    this.clientSizes[client] = { rows, cols };
    this.resize();
  };

  private resize = () => {
    if (this.pty == null) {
      // nothing to do
      return;
    }
    const size = this.getSize();
    if (size == null) {
      return;
    }
    const { rows, cols } = size;
    logger.debug("resize", "new size", rows, cols);
    try {
      this.setSizePty({ rows, cols });
      // broadcast out new size
      this.nc.publish(this.subject, jc.encode({ cmd: "size", rows, cols }));
    } catch (err) {
      logger.debug("terminal channel -- WARNING: unable to resize term", err);
    }
  };

  setSizePty = ({ rows, cols }: { rows: number; cols: number }) => {
    logger.debug("setSize", { rows, cols });
    if (this.pty == null) {
      logger.debug("setSize: not doing since pty not defined");
      return;
    }
    logger.debug("setSize", { rows, cols }, "DOING IT!");

    this.pty.resize(cols, rows);
    this.size = { rows, cols };
  };

  getSize = (): { rows: number; cols: number } | undefined => {
    const sizes = this.clientSizes;
    if (len(sizes) == 0) {
      return;
    }
    let rows: number = INFINITY;
    let cols: number = INFINITY;
    for (const id in sizes) {
      if (sizes[id].rows) {
        // if, since 0 rows or 0 columns means *ignore*.
        rows = Math.min(rows, sizes[id].rows);
      }
      if (sizes[id].cols) {
        cols = Math.min(cols, sizes[id].cols);
      }
    }
    if (rows === INFINITY || cols === INFINITY) {
      // no clients with known sizes currently visible
      return;
    }
    // ensure valid values
    rows = Math.max(rows ?? 1, rows);
    cols = Math.max(cols ?? 1, cols);
    // cache for future use.
    this.size = { rows, cols };
    return { rows, cols };
  };
}

function getCWD(pathHead, cwd?): string {
  // working dir can be set explicitly, and either be an empty string or $HOME
  if (cwd != null) {
    const HOME = process.env.HOME ?? "/home/user";
    if (cwd === "") {
      return HOME;
    } else if (cwd.startsWith("$HOME")) {
      return cwd.replace("$HOME", HOME);
    } else {
      return cwd;
    }
  }
  return pathHead;
}
