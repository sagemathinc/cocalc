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
import { dstream, type DStream } from "@cocalc/project/conat/sync";
import {
  createTerminalServer,
  createBrowserClient,
  SIZE_TIMEOUT_MS,
} from "@cocalc/conat/service/terminal";
import { project_id, compute_server_id } from "@cocalc/project/data";
import { isEqual, throttle } from "lodash";
import { ThrottleString as Throttle } from "@cocalc/util/throttle";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";

const logger = getLogger("project:conat:terminal");

const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";

// The printf at the end clears the line so the user doesn't see it. This took
// way too long to figure out how to do. See
//   https://stackoverflow.com/questions/5861428/bash-script-erase-previous-line
// const COMPUTE_SERVER_PROMPT_MESSAGE =
//   `PS1="(\\h) \\w$ "; history -d $(history 1); printf '\\e[A\\e[K'\n`;

const COMPUTE_SERVER_PROMPT_MESSAGE =
  'PS1="(\\h) \\w$ ";reset;history -d $(history 1)\n';

const DEFAULT_COMMAND = "/bin/bash";
const INFINITY = 999999;

const HISTORY_LIMIT_BYTES = parseInt(
  process.env.COCALC_TERMINAL_HISTORY_LIMIT_BYTES ?? "2000000",
);

// Limits that result in dropping messages -- this makes sense for a terminal (unlike a file you're editing).

//   Limit number of bytes per second in data:
const MAX_BYTES_PER_SECOND = parseInt(
  process.env.COCALC_TERMINAL_MAX_BYTES_PER_SECOND ?? "1000000",
);

// Hard limit at stream level the number of messages per second.
// However, the code in this file must already limit
// writing output less than this to avoid the stream ever
// having to discard writes.  This is basically the "frame rate"
// we are supporting for users.
const MAX_MSGS_PER_SECOND = parseInt(
  process.env.COCALC_TERMINAL_MAX_MSGS_PER_SECOND ?? "24",
);

const servers: { [path: string]: any } = {};

const sessions: { [path: string]: Session } = {};

interface CreateOptions {
  env?: { [key: string]: string };
  command?: string;
  args?: string[];
  cwd?: string;
  ephemeral?: boolean;
}

export const createTerminalService = reuseInFlight(
  async (path: string, opts?: CreateOptions) => {
    if (servers[path] != null) {
      return;
    }
    let options: any = undefined;
    console.log(new Date(), "createTerminalService", path, opts);
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
      create: async (
        opts: CreateOptions,
      ): Promise<{ success: "ok"; note?: string; ephemeral?: boolean }> => {
        console.log(new Date(), "terminal.create", path, opts);
        // save options to reuse.
        options = opts;
        const note = await createTerminal({ ...opts, path });
        console.log(path, new Date(), "done!", note);
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

      size: async (opts: {
        rows: number;
        cols: number;
        browser_id: string;
        kick?: boolean;
      }) => {
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
      delete servers[path];
    });
    servers[path] = server;
    if (opts != null) {
      await impl.create(opts);
    }
  },
);

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
    await ensureContainingDirectoryExists(path);
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
      ephemeral: this.options.ephemeral,
      config: {
        max_bytes: HISTORY_LIMIT_BYTES,
        max_bytes_per_second: MAX_BYTES_PER_SECOND,
        max_msgs_per_second: MAX_MSGS_PER_SECOND,
      },
    });
    this.stream.on("reject", () => {
      this.throttledEllipses();
    });
    if (
      this.stream.length > 1 &&
      !this.stream.get(this.stream.length - 1)?.includes(EXIT_MESSAGE) &&
      !this.stream.get(this.stream.length - 2)?.includes(EXIT_MESSAGE)
    ) {
      this.stream.publish(EXIT_MESSAGE);
    }
  };

  private throttledEllipses = throttle(
    () => {
      this.stream?.publish(`\r\n[excessive output discarded]\r\n\r\n`);
    },
    1000,
    { leading: true, trailing: true },
  );

  init = async () => {
    const { head, tail } = path_split(this.path);
    const env = {
      PROMPT_COMMAND: "history -a",
      HISTFILE: historyFile(this.path),
      ...this.options.env,
      ...envForSpawn(),
      COCALC_TERMINAL_FILENAME: tail,
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
    if (compute_server_id && command == "/bin/bash") {
      // set the prompt to show the remote hostname explicitly,
      // then clear the screen.
      this.pty.write(COMPUTE_SERVER_PROMPT_MESSAGE);
    }
    this.state = "running";
    logger.debug("creating stream");
    await this.createStream();
    logger.debug("created the stream");
    if ((this.state as State) == "closed") {
      return;
    }
    logger.debug("connect stream to pty");

    // use a
    const throttle = new Throttle(1000 / MAX_MSGS_PER_SECOND);
    throttle.on("data", (data: string) => {
      this.handleBackendMessages(data);
      this.stream?.publish(data);
    });
    this.pty.onData(throttle.write);

    this.pty.onExit(() => {
      this.stream?.publish(EXIT_MESSAGE);
      this.state = "off";
    });
  };

  setSize = ({
    browser_id,
    rows,
    cols,
    kick,
  }: {
    browser_id: string;
    rows: number;
    cols: number;
    kick?: boolean;
  }) => {
    if (kick) {
      this.clientSizes = {};
    }
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
      // tell browsers about our new size
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

    // the underlying ptyjs library -- if it thinks the size is already set,
    // it will do NOTHING.  This ends up being very bad when clients reconnect.
    // As a hack, we just change it, then immediately change it back
    this.pty.resize(cols, rows + 1);
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

function historyFile(path: string) {
  const i = path.lastIndexOf("-");
  return `${path_split(path.slice(0, i)).tail}.bash_history`;
}
