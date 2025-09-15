import { spawn } from "@lydell/node-pty";
import { envForSpawn } from "@cocalc/backend/misc";
import { path_split, split } from "@cocalc/util/misc";
import { console_init_filename, len } from "@cocalc/util/misc";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { getLogger } from "@cocalc/project/logger";
import { readlink, realpath, rm } from "node:fs/promises";
import { dstream, type DStream } from "@cocalc/project/conat/sync";
import {
  createBrowserClient,
  SIZE_TIMEOUT_MS,
} from "@cocalc/conat/service/terminal";
import { project_id, compute_server_id } from "@cocalc/project/data";
import { throttle } from "lodash";
import { ThrottleString } from "@cocalc/util/throttle";
import { join } from "path";
import type { CreateTerminalOptions } from "@cocalc/conat/project/api/editor";
import { delay } from "awaiting";
import { SpoolWatcher } from "@cocalc/backend/spool-watcher";
import { data } from "@cocalc/backend/data";
import { randomId } from "@cocalc/conat/names";

const logger = getLogger("project:conat:terminal:session");

// truncated excessive INPUT is CRITICAL to avoid deadlocking the terminal
// and completely crashing the project in case a user pastes in, e.g.,
// a few hundred K, like this gist: https://gist.github.com/cheald/2905882
// to a node session.   Note VS code also crashes.
const MAX_INPUT_SIZE = 10000;
const INPUT_CHUNK_SIZE = 50;

const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";

const HARD_RESET = "reset";

const COMPUTE_SERVER_INIT = `PS1="(\\h) \\w$ "; ${HARD_RESET}; history -d $(history 1);\n`;

const PROJECT_INIT = `${HARD_RESET}; history -d $(history 1);\n`;

const DEFAULT_COMMAND = "bash";
const INFINITY = 999999;

const HISTORY_LIMIT_BYTES = parseInt(
  process.env.COCALC_TERMINAL_HISTORY_LIMIT_BYTES ?? "1000000",
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
  process.env.COCALC_TERMINAL_MAX_MSGS_PER_SECOND ?? "20",
);

type State = "running" | "off" | "closed";

export class Session {
  public state: State = "off";
  public options: CreateTerminalOptions;
  private termPath: string;
  private pty?;
  private size?: { rows: number; cols: number };
  private browserApi: ReturnType<typeof createBrowserClient>;
  private stream?: DStream<string>;
  private streamName: string;
  private clientSizes: {
    [browser_id: string]: { rows: number; cols: number; time: number };
  } = {};
  public pid: number;
  private messageSpool?: SpoolWatcher;
  private spoolDirectory?: string;

  constructor({
    termPath,
    options,
  }: {
    termPath: string;
    options: CreateTerminalOptions;
  }) {
    logger.debug("create session ", { termPath, options });
    this.termPath = termPath;
    this.browserApi = createBrowserClient({ project_id, termPath });
    this.options = options;
    this.streamName = `terminal-${termPath}`;
    this.spoolDirectory = join(data, "term-spool", randomId());
  }

  kill = async () => {
    if (this.stream == null) {
      return;
    }
    await this.stream.delete({ all: true });
  };

  write = async (data) => {
    if (this.state == "off") {
      await this.restart();
      // don't write when it starts it, since this is often a carriage return or space,
      // which you don't want to send except to start it.
      return;
    }
    let reject;
    if (data.length > MAX_INPUT_SIZE) {
      data = data.slice(0, MAX_INPUT_SIZE);
      reject = true;
    } else {
      reject = false;
    }
    for (
      let i = 0;
      i < data.length && this.pty != null;
      i += INPUT_CHUNK_SIZE
    ) {
      const chunk = data.slice(i, i + INPUT_CHUNK_SIZE);
      this.pty.write(chunk);
      // logger.debug("wrote data to pty", chunk.length);
      await delay(1000 / MAX_MSGS_PER_SECOND);
    }
    if (reject) {
      this.stream?.publish(`\r\n[excessive input discarded]\r\n\r\n`);
    }
  };

  restart = async () => {
    this.pty?.destroy();
    this.stream?.close();
    this.messageSpool?.close();
    delete this.pty;
    await this.init();
  };

  close = () => {
    if (this.state != "off") {
      this.stream?.publish(EXIT_MESSAGE);
    }
    this.pty?.destroy();
    this.stream?.close();
    this.messageSpool?.close();
    delete this.pty;
    delete this.stream;
    delete this.messageSpool;
    (async () => {
      try {
        if (this.spoolDirectory) {
          await rm(this.spoolDirectory, { force: true, recursive: true });
        }
      } catch {}
    })();
    delete this.spoolDirectory;
    this.state = "closed";
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
        // we throttle to less than MAX_MSGS_PER_SECOND client side, and
        // have server impose a much higher limit, since messages can arrive
        // in a group.
        max_msgs_per_second: 5 * MAX_MSGS_PER_SECOND,
      },
    });
    // this.stream.publish("\r\n".repeat((this.size?.rows ?? 40) + 40));
    this.stream.on("reject", () => {
      this.throttledEllipses();
    });
  };

  private throttledEllipses = throttle(
    () => {
      this.stream?.publish(`\r\n[excessive output discarded]\r\n\r\n`);
    },
    1000,
    { leading: true, trailing: true },
  );

  init = async () => {
    const { head, tail } = path_split(this.termPath);
    const HISTFILE = historyFile(this.options.path);
    const env = {
      PROMPT_COMMAND: "history -a",
      ...(HISTFILE ? { HISTFILE } : undefined),
      ...this.options.env,
      ...envForSpawn(),
      COCALC_TERMINAL_FILENAME: tail,
      COCALC_CONTROL_DIR: this.spoolDirectory,
      TMUX: undefined, // ensure not set
    };
    let command = this.options.command ?? DEFAULT_COMMAND;
    let args = this.options.args ?? [];
    const initFilename: string = console_init_filename(this.termPath);
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
      handleFlowControl: true,
    });
    this.pid = this.pty.pid;
    if (command.endsWith("bash")) {
      if (compute_server_id) {
        // set the prompt to show the remote hostname explicitly,
        // then clear the screen.
        this.pty.write(COMPUTE_SERVER_INIT);
      } else {
        this.pty.write(PROJECT_INIT);
      }
    }
    this.state = "running";
    logger.debug("creating stream");
    await this.createStream();
    logger.debug("created the stream");
    if ((this.state as State) == "closed") {
      return;
    }
    logger.debug("connect stream to pty");

    // use slighlty less than MAX_MSGS_PER_SECOND to avoid reject
    // due to being *slightly* off.
    const throttle = new ThrottleString(MAX_MSGS_PER_SECOND - 3);
    throttle.on("data", (data: string) => {
      this.stream?.publish(data);
    });
    this.pty.onData(throttle.write);

    this.pty.onExit(() => {
      this.stream?.publish(EXIT_MESSAGE);
      this.state = "off";
    });

    await this.initMessageSpool();
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
    // logger.debug("resize", "new size", rows, cols);
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

  private initMessageSpool = async () => {
    if (!this.spoolDirectory) {
      throw Error("no spool directory");
    }
    this.messageSpool = new SpoolWatcher(this.spoolDirectory, async (msg) => {
      try {
        await this.browserApi.command(msg);
      } catch (err) {
        // could fail, e.g., if there are no browser clients suddenly.
        logger.debug(
          "WARNING: problem sending command to browser clients",
          err,
        );
      }
    });

    await this.messageSpool.start();
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

function historyFile(path: string): string | undefined {
  if (path.startsWith("/")) {
    // only set histFile for paths in the home directory i.e.,
    // relative to HOME. Absolute paths -- we just leave it alone.
    // E.g., the miniterminal uses /tmp/... for its path.
    return undefined;
  }
  const { head, tail } = path_split(path);
  return join(
    process.env.HOME ?? "",
    head,
    tail.endsWith(".term") ? tail : ".bash_history",
  );
}
