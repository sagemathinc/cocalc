import type {
  ClientCommand,
  PrimusChannel,
  PrimusWithChannels,
  Options,
} from "./types";
import { getName } from "./util";
import { console_init_filename, len, path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/backend/logger";
import { envForSpawn } from "@cocalc/backend/misc";
import { getCWD } from "./util";
import { readlink, realpath, readFile, writeFile } from "node:fs/promises";
import { spawn, IPty as IPty0 } from "node-pty";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { isEqual } from "lodash";
import { Spark } from "primus";

const logger = getLogger("terminal:terminal");

const CHECK_INTERVAL_MS = 5 * 1000;
const MAX_HISTORY_LENGTH = 10 * 1000 * 1000;
const TRUNCATE_THRESH_MS = 10 * 1000;
const FREQUENT_RESTART_DELAY_MS = 1.5 * 1000;
const INFINITY = 999999;
const DEFAULT_COMMAND = "/bin/bash";

type MessagesState = "none" | "reading";
type State = "init" | "ready" | "closed";

// upstream typings not quite right
interface IPty extends IPty0 {
  on: (event: string, f: (...args) => void) => void;
}

export class Terminal {
  private state: State = "init";
  private options: Options;
  private channel: PrimusChannel;
  private history: string = "";
  private path: string;
  private client_sizes = {};
  private last_truncate_time: number = Date.now();
  private truncating: number = 0;
  private last_exit: number = 0;
  private size?: { rows: number; cols: number };
  private term?: IPty;
  private backendMessagesBuffer = "";
  private backendMessagesState: MessagesState = "none";

  constructor(primus: PrimusWithChannels, path: string, options: Options = {}) {
    const name = getName(path);
    this.options = { command: DEFAULT_COMMAND, ...options };
    this.path = path;
    this.channel = primus.channel(name);
  }

  init = async () => {
    if (this.state == "closed") return;
    const args: string[] = [];

    const { options } = this;
    if (options.args != null) {
      for (const arg of options.args) {
        if (typeof arg === "string") {
          args.push(arg);
        } else {
          logger.debug("WARNING -- discarding invalid non-string arg ", arg);
        }
      }
    } else {
      const initFilename: string = console_init_filename(this.path);
      if (await exists(initFilename)) {
        args.push("--init-file");
        args.push(path_split(initFilename).tail);
      }
    }

    const { head: pathHead, tail: pathTail } = path_split(this.path);
    const env = {
      COCALC_TERMINAL_FILENAME: pathTail,
      ...envForSpawn(),
      ...options.env,
    };
    if (env["TMUX"]) {
      // If TMUX was set for some reason in the environment that setup
      // a cocalc project (e.g., start hub in dev mode from tmux), then
      // TMUX is set even though terminal hasn't started tmux yet, which
      // confuses our open command.  So we explicitly unset it here.
      // https://unix.stackexchange.com/questions/10689/how-can-i-tell-if-im-in-a-tmux-session-from-a-bash-script
      delete env["TMUX"];
    }

    const { command } = options;
    if (command == null) {
      throw Error("bug");
    }
    const cwd = getCWD(pathHead, options.cwd);

    try {
      this.history = (await readFile(this.path)).toString();
    } catch (err) {
      logger.debug("WARNING: failed to load", this.path, err);
    }
    const term = spawn(command, args, { cwd, env }) as IPty;
    logger.debug("pid=", term.pid, { command, args });
    this.term = term;

    term.on("data", this.handleDataFromTerminal);

    // Whenever term ends, we just respawn it, but potentially
    // with a pause to avoid weird crash loops bringing down the project.
    term.on("exit", async () => {
      if (this.state == "closed") return;
      logger.debug("EXIT -- spawning again");
      const now = Date.now();
      if (now - this.last_exit <= 15000) {
        // frequent exit; we wait a few seconds, since otherwise channel
        // restarting could burn all cpu and break everything.
        logger.debug("EXIT -- waiting a few seconds before trying again...");
        await delay(FREQUENT_RESTART_DELAY_MS);
      }
      this.last_exit = now;
      logger.debug("spawning...");
      await this.init();
      logger.debug("finished spawn");
    });

    this.channel.on("connection", this.handleNewClientConnection);

    this.state = "ready";

    // set the size
    this.resize();
  };

  close = () => {
    logger.debug("close");
    if ((this.state as State) == "closed") {
      return;
    }
    this.state = "closed";
    this.killTerm();
    this.channel.destroy();
  };

  getPid = (): number | undefined => {
    return this.term?.pid;
  };

  // original path
  getPath = () => {
    return this.options.path;
  };

  getCommand = () => {
    return this.options.command;
  };

  setCommand = (command: string, args?: string[]) => {
    if (this.state == "closed") return;
    if (command == this.options.command && isEqual(args, this.options.args)) {
      logger.debug("setCommand: no actual change.");
      return;
    }
    logger.debug(
      "setCommand",
      { command: this.options.command, args: this.options.args },
      "-->",
      { command, args },
    );
    this.options.command = command;
    this.options.args = args;
    this.killTerm();
  };

  private killTerm = () => {
    if (this.term == null) return;
    logger.debug("killing ", this.term.pid);
    process.kill(this.term.pid, "SIGKILL");
    delete this.term;
  };

  private saveHistoryToDisk = throttle(async () => {
    try {
      await writeFile(this.path, this.history);
    } catch (err) {
      logger.debug("WARNING: failed to save terminal history to disk", err);
    }
  }, 15000);

  private resetBackendMessagesBuffer = () => {
    this.backendMessagesBuffer = "";
    this.backendMessagesState = "none";
  };

  private handleDataFromTerminal = (data) => {
    if (this.state == "closed") return;
    //logger.debug("terminal: term --> browsers", data);
    this.handleBackendMessages(data);
    this.history += data;
    this.saveHistoryToDisk();
    const n = this.history.length;
    if (n >= MAX_HISTORY_LENGTH) {
      logger.debug("terminal data -- truncating");
      this.history = this.history.slice(n - MAX_HISTORY_LENGTH / 2);
      const last = this.last_truncate_time;
      const now = new Date().valueOf();
      this.last_truncate_time = now;
      logger.debug(now, last, now - last, TRUNCATE_THRESH_MS);
      if (now - last <= TRUNCATE_THRESH_MS) {
        // getting a huge amount of data quickly.
        if (!this.truncating) {
          this.channel.write({ cmd: "burst" });
        }
        this.truncating += data.length;
        setTimeout(this.checkIfStillTruncating, CHECK_INTERVAL_MS);
        if (this.truncating >= 5 * MAX_HISTORY_LENGTH) {
          // only start sending control+c if output has been completely stuck
          // being truncated several times in a row -- it has to be a serious non-stop burst...
          this.term?.write("\u0003");
        }
        return;
      } else {
        this.truncating = 0;
      }
    }
    if (!this.truncating) {
      this.channel.write(data);
    }
  };

  private checkIfStillTruncating = () => {
    if (!this.truncating) {
      return;
    }
    if (Date.now() - this.last_truncate_time >= CHECK_INTERVAL_MS) {
      // turn off truncating, and send recent data.
      const { truncating, history } = this;
      this.channel.write(
        history.slice(Math.max(0, history.length - truncating)),
      );
      this.truncating = 0;
      this.channel.write({ cmd: "no-burst" });
    } else {
      setTimeout(this.checkIfStillTruncating, CHECK_INTERVAL_MS);
    }
  };

  private handleBackendMessages = (data: string) => {
    /* parse out messages like this:
            \x1b]49;"valid JSON string here"\x07
         and format and send them via our json channel.
         NOTE: such messages also get sent via the
         normal channel, but ignored by the client.
      */
    if (this.backendMessagesState === "none") {
      const i = data.indexOf("\x1b");
      if (i === -1) {
        return; // nothing to worry about
      }
      // stringify it so it is easy to see what is there:
      this.backendMessagesState = "reading";
      this.backendMessagesBuffer = data.slice(i);
    } else {
      this.backendMessagesBuffer += data;
    }
    if (
      this.backendMessagesBuffer.length >= 5 &&
      this.backendMessagesBuffer.slice(1, 5) != "]49;"
    ) {
      this.resetBackendMessagesBuffer();
      return;
    }
    if (this.backendMessagesBuffer.length >= 6) {
      const i = this.backendMessagesBuffer.indexOf("\x07");
      if (i === -1) {
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
      try {
        const payload = JSON.parse(s);
        this.channel.write({ cmd: "message", payload });
      } catch (err) {
        logger.warn(
          `handle_backend_message: error sending JSON payload ${JSON.stringify(
            s,
          )}, ${err}`,
        );
        // Otherwise, ignore...
      }
    }
  };

  private setSize = (spark: Spark, newSize: { rows; cols }) => {
    this.client_sizes[spark.id] = newSize;
    try {
      this.resize();
    } catch (err) {
      // no-op -- can happen if terminal is restarting.
      logger.debug("WARNING: resizing terminal", this.path, err);
    }
  };

  private resize = () => {
    if (this.state == "closed") return;
    //logger.debug("resize");
    if (this.term == null) {
      // nothing to do
      return;
    }
    const sizes = this.client_sizes;
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
      // no clients currently visible
      delete this.size;
      return;
    }
    if (rows && cols) {
      logger.debug("resize", "new size", rows, cols);
      try {
        this.term.resize(cols, rows);
      } catch (err) {
        logger.debug(
          "terminal channel",
          `WARNING: unable to resize term ${err}`,
        );
      }
      this.channel.write({ cmd: "size", rows, cols });
    }
  };

  private sendCurrentWorkingDirectory = async (spark: Spark) => {
    if (this.term == null) {
      return;
    }
    // we reply with the current working directory of the underlying terminal process,
    // which is why we use readlink and proc below.
    const pid = this.term.pid;
    // [hsy/dev] wrapping in realpath, because I had the odd case, where the project's
    // home included a symlink, hence the "startsWith" below didn't remove the home dir.
    const home = await realpath(process.env.HOME ?? "/home/user");
    const cwd = await readlink(`/proc/${pid}/cwd`);
    // try to send back a relative path, because the webapp does not
    // understand absolute paths
    const path = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
    logger.debug("terminal cwd sent back", { path });
    spark.write({ cmd: "cwd", payload: path });
  };

  private bootAllOtherClients = (spark: Spark) => {
    // delete all sizes except this one, so at least kick resets
    // the sizes no matter what.
    for (const id in this.client_sizes) {
      if (id !== spark.id) {
        delete this.client_sizes[id];
      }
    }
    // next tell this client to go fullsize.
    if (this.size != null) {
      const { rows, cols } = this.size;
      if (rows && cols) {
        spark.write({ cmd: "size", rows, cols });
      }
    }
    // broadcast message to all other clients telling them to close.
    this.channel.forEach((spark0, id, _) => {
      if (id !== spark.id) {
        spark0.write({ cmd: "close" });
      }
    });
  };

  private handleDataFromClient = async (
    spark,
    data: string | ClientCommand,
  ) => {
    //logger.debug("terminal: browser --> term", name, JSON.stringify(data));
    if (typeof data === "string") {
      if (this.term == null) {
        spark.write("\nTerminal is not initialized.\n");
        return;
      }
      this.term.write(data);
    } else if (typeof data === "object") {
      await this.handleCommandFromClient(spark, data);
    }
  };

  private handleCommandFromClient = async (
    spark: Spark,
    data: ClientCommand,
  ) => {
    // control message
    //logger.debug("terminal channel control message", JSON.stringify(data));
    switch (data.cmd) {
      case "size":
        this.setSize(spark, { rows: data.rows, cols: data.cols });
        break;

      case "set_command":
        this.setCommand(data.command, data.args);
        break;

      case "kill":
        // send kill signal
        this.killTerm();
        break;

      case "cwd":
        await this.sendCurrentWorkingDirectory(spark);
        break;

      case "boot": {
        this.bootAllOtherClients(spark);
        break;
      }
    }
  };

  private handleNewClientConnection = (spark: Spark) => {
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`,
    );

    // send current size info
    if (this.size != null) {
      const { rows, cols } = this.size;
      spark.write({ cmd: "size", rows, cols });
    }

    // send burst info
    if (this.truncating) {
      spark.write({ cmd: "burst" });
    }

    // send history
    spark.write(this.history);

    // have history, so do not ignore commands now.
    spark.write({ cmd: "no-ignore" });

    spark.on("end", () => {
      if (this.state == "closed") return;
      delete this.client_sizes[spark.id];
      this.resize();
    });

    spark.on("data", async (data) => {
      if ((this.state as State) == "closed") return;
      try {
        await this.handleDataFromClient(spark, data);
      } catch (err) {
        if (this.state != "closed") {
          spark.write(`${err}`);
        }
      }
    });
  };
}
