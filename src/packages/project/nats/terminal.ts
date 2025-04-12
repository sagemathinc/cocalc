/*
Terminal

- using NATS
*/

import { spawn } from "@lydell/node-pty";
import { envForSpawn } from "@cocalc/backend/misc";
import { path_split } from "@cocalc/util/misc";
import { console_init_filename, len } from "@cocalc/util/misc";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/project/logger";
import { readlink, realpath } from "node:fs/promises";
import { dstream, type DStream } from "@cocalc/project/nats/sync";
import {
  createTerminalServer,
  createBrowserClient,
  SIZE_TIMEOUT_MS,
} from "@cocalc/nats/service/terminal";
import { project_id } from "@cocalc/project/data";
import { isEqual, throttle } from "lodash";

const logger = getLogger("server:nats:terminal");

const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";
const DEFAULT_COMMAND = "/bin/bash";
const INFINITY = 999999;

const HISTORY_LIMIT_BYTES = 20000;

// Limits that result in dropping messages -- this makes sense for a terminal (unlike a file you're editing).

//   Limit number of MB/s in data:
const MAX_BYTES_PER_SECOND = 1 * 1000000;

//   Limit number of messages per second (not doing this makes it easy to cause trouble to the server)
const MAX_MSGS_PER_SECOND = 250;

const sessions: { [path: string]: Session } = {};

export async function createTerminalService(path: string) {
  let options: any = undefined;
  const getSession = async (noCreate?: boolean) => {
    const cur = sessions[path];
    if (cur == null) {
      if (noCreate) {
        throw Error("no terminal session");
      }
      await createTerminal({ ...options, path });
      const session = sessions[path];
      if (session == null) {
        throw Error(
          `BUG: failed to create terminal session - ${path} (this should not happen)`,
        );
      }
      return session;
    }
    return cur;
  };
  const impl = {
    create: async (opts: {
      env?: { [key: string]: string };
      command?: string;
      args?: string[];
      cwd?: string;
    }): Promise<{ success: "ok"; note?: string }> => {
      // save options to reuse.
      options = opts;
      const note = await createTerminal({ ...opts, path });
      return { success: "ok", note };
    },

    write: async (data: string): Promise<void> => {
      if (typeof data != "string") {
        throw Error(`data must be a string -- ${JSON.stringify(data)}`);
      }
      const session = await getSession();
      await session.write(data);
    },

    restart: async () => {
      const session = await getSession();
      await session.restart();
    },

    cwd: async () => {
      const session = await getSession();
      return await session.getCwd();
    },

    kill: async () => {
      try {
        const session = await getSession(true);
        await session.close();
      } catch {
        return;
      }
    },

    size: async (opts: { rows: number; cols: number; browser_id: string }) => {
      const session = await getSession();
      session.setSize(opts);
    },

    close: async (browser_id: string) => {
      sessions[path]?.browserLeaving(browser_id);
    },
  };

  const server = await createTerminalServer({ path, project_id, impl });
  server.on("close", () => {
    sessions[path]?.close();
    delete sessions[path];
  });
  return server;
}

function closeTerminal(path: string) {
  const cur = sessions[path];
  if (cur != null) {
    cur.close();
    delete sessions[path];
  }
}

export const createTerminal = reuseInFlight(
  async (params) => {
    if (params == null) {
      throw Error("params must be specified");
    }
    const { path, ...options } = params;
    if (!path) {
      throw Error("path must be specified");
    }
    let note = "";
    const cur = sessions[path];
    if (cur != null) {
      if (!isEqual(cur.options, options) || cur.state == "closed") {
        // clean up -- we will make new one below
        closeTerminal(path);
        note += "Closed existing session. ";
      } else {
        // already have a working session with correct options
        note += "Already have working session with same options. ";
        return note;
      }
    }
    note += "Creating new session.";
    let session = new Session({ path, options });
    await session.init();
    if (session.state == "closed") {
      // closed during init -- unlikely but possible; try one more time
      session = new Session({ path, options });
      await session.init();
      if (session.state == "closed") {
        throw Error(`unable to create terminal session for ${path}`);
      }
    } else {
      sessions[path] = session;
      return note;
    }
  },
  {
    createKey: (args) => {
      return args[0]?.path ?? "";
    },
  },
);

type State = "running" | "off" | "closed";

class Session {
  public state: State = "off";
  public options;
  private path: string;
  private pty?;
  private size?: { rows: number; cols: number };
  private browserApi: ReturnType<typeof createBrowserClient>;
  private stream?: DStream<string>;
  private streamName: string;
  private clientSizes: {
    [browser_id: string]: { rows: number; cols: number; time: number };
  } = {};

  constructor({ path, options }) {
    logger.debug("create session ", { path, options });
    this.path = path;
    this.browserApi = createBrowserClient({ project_id, path });
    this.options = options;
    this.streamName = `terminal-${path}`;
  }

  write = async (data) => {
    if (this.state == "off") {
      await this.restart();
      // don't write when it starts it, since this is often a carriage return or space,
      // which you don't want to send except to start it.
      return;
    }
    this.pty?.write(data);
  };

  restart = async () => {
    this.pty?.destroy();
    this.stream?.close();
    delete this.pty;
    await this.init();
  };

  close = () => {
    if (this.state != "off") {
      this.stream?.publish(EXIT_MESSAGE);
    }
    this.pty?.destroy();
    this.stream?.close();
    delete this.pty;
    delete this.stream;
    this.state = "closed";
    if (sessions[this.path] === this) {
      delete sessions[this.path];
    }
    this.clientSizes = {};
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

  createStream = async () => {
    this.stream = await dstream<string>({
      name: this.streamName,
      limits: {
        max_bytes: HISTORY_LIMIT_BYTES,
        max_bytes_per_second: MAX_BYTES_PER_SECOND,
        max_msgs_per_second: MAX_MSGS_PER_SECOND,
      },
    });
    this.stream.on("reject", ({ err }) => {
      if (err.limit == "max_bytes_per_second") {
        // instead, send something small
        this.throttledEllipses("bytes");
      } else if (err.limit == "max_msgs_per_second") {
        // only sometimes send [...], because channel is already full and it
        // doesn't help to double the messages!
        this.throttledEllipses("messages");
      }
    });
  };

  private throttledEllipses = throttle(
    (what) => {
      this.stream?.publish(` [...(truncated ${what})...] `);
    },
    1000,
    { leading: true, trailing: true },
  );

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
    if (this.state == "closed") {
      return;
    }
    const cwd = getCWD(head, this.options.cwd);
    logger.debug("creating pty");
    this.pty = spawn(command, args, {
      cwd,
      env,
      rows: this.size?.rows,
      cols: this.size?.cols,
    });
    this.state = "running";
    logger.debug("creating stream");
    await this.createStream();
    if ((this.state as State) == "closed") {
      return;
    }
    logger.debug("connect stream to pty");
    this.pty.onData((data: string) => {
      this.handleBackendMessages(data);
      this.stream?.publish(data);
    });
    this.pty.onExit(() => {
      this.stream?.publish(EXIT_MESSAGE);
      this.state = "off";
    });
  };

  setSize = ({
    browser_id,
    rows,
    cols,
  }: {
    browser_id: string;
    rows: number;
    cols: number;
  }) => {
    this.clientSizes[browser_id] = { rows, cols, time: Date.now() };
    this.resize();
  };

  browserLeaving = (browser_id: string) => {
    delete this.clientSizes[browser_id];
    this.resize();
  };

  private resize = async () => {
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
      // tell browsers about out new size
      await this.browserApi.size({ rows, cols });
    } catch (err) {
      logger.debug(`WARNING: unable to resize term: ${err}`);
    }
  };

  setSizePty = ({ rows, cols }: { rows: number; cols: number }) => {
    // logger.debug("setSize", { rows, cols });
    if (this.pty == null) {
      // logger.debug("setSize: not doing since pty not defined");
      return;
    }
    // logger.debug("setSize", { rows, cols }, "DOING IT!");

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
    const cutoff = Date.now() - SIZE_TIMEOUT_MS;
    for (const id in sizes) {
      if ((sizes[id].time ?? 0) <= cutoff) {
        delete sizes[id];
        continue;
      }
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

  private backendMessagesBuffer = "";
  private backendMessagesState = "none";

  private resetBackendMessagesBuffer = () => {
    this.backendMessagesBuffer = "";
    this.backendMessagesState = "none";
  };

  private handleBackendMessages = (data: string) => {
    /* parse out messages like this:
            \x1b]49;"valid JSON string here"\x07
         and format and send them via our json channel.
      */
    if (this.backendMessagesState === "none") {
      const i = data.indexOf("\x1b]49;");
      if (i == -1) {
        return; // nothing to worry about
      }
      // stringify it so it is easy to see what is there:
      this.backendMessagesState = "reading";
      this.backendMessagesBuffer = data.slice(i);
    } else {
      this.backendMessagesBuffer += data;
    }
    if (this.backendMessagesBuffer.length >= 6) {
      const i = this.backendMessagesBuffer.indexOf("\x07");
      if (i == -1) {
        // continue to wait... unless too long
        if (this.backendMessagesBuffer.length > 10000) {
          this.resetBackendMessagesBuffer();
        }
        return;
      }
      const s = this.backendMessagesBuffer.slice(5, i);
      this.resetBackendMessagesBuffer();
      logger.debug(
        `handle_backend_message: parsing JSON payload ${JSON.stringify(s)}`,
      );
      let mesg;
      try {
        mesg = JSON.parse(s);
      } catch (err) {
        logger.warn(
          `handle_backend_message: error sending JSON payload ${JSON.stringify(
            s,
          )}, ${err}`,
        );
        return;
      }
      (async () => {
        try {
          await this.browserApi.command(mesg);
        } catch (err) {
          // could fail, e.g., if there are no browser clients suddenly.
          logger.debug(
            "WARNING: problem sending command to browser clients",
            err,
          );
        }
      })();
    }
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
