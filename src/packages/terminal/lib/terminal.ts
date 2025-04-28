import type {
  ClientCommand,
  IPty,
  PrimusChannel,
  PrimusWithChannels,
  Options,
} from "./types";
import { getChannelName, getRemotePtyChannelName } from "./util";
import { console_init_filename, len, path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/backend/logger";
import { envForSpawn } from "@cocalc/backend/misc";
import { getCWD } from "./util";
import { readlink, realpath, readFile, writeFile } from "node:fs/promises";
import { spawn } from "@lydell/node-pty";
import { throttle } from "lodash";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { isEqual } from "lodash";
import type { Spark } from "primus";
import { join } from "path";

const logger = getLogger("terminal:terminal");

const CHECK_INTERVAL_MS = 5 * 1000;
export const MAX_HISTORY_LENGTH = 1000 * 1000;
const TRUNCATE_THRESH_MS = 500;
const INFINITY = 999999;
const DEFAULT_COMMAND = "/bin/bash";

const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";

export const REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS = 7.5 * 1000;

type MessagesState = "none" | "reading";
type State = "init" | "ready" | "closed";

export class Terminal {
  private state: State = "init";
  private options: Options;
  private channel: PrimusChannel;
  private remotePtyChannel: PrimusChannel;
  private history: string = "";
  private path: string;
  private client_sizes = {};
  private last_truncate_time: number = Date.now();
  private truncating: number = 0;
  private size?: { rows: number; cols: number };
  private backendMessagesBuffer = "";
  private backendMessagesState: MessagesState = "none";
  // two different ways of providing the backend support -- local or remote
  private localPty?: IPty;
  private remotePty?: Spark;
  private computeServerId: number = 0;
  private remotePtyHeartbeatInterval;

  constructor(primus: PrimusWithChannels, path: string, options: Options = {}) {
    this.options = { command: DEFAULT_COMMAND, ...options };
    this.path = path;
    this.channel = primus.channel(getChannelName(path));
    this.channel.on("connection", this.handleClientConnection);
    this.remotePtyChannel = primus.channel(getRemotePtyChannelName(path));
    this.remotePtyChannel.on("connection", (conn) => {
      logger.debug("new remote terminal connection");
      this.handleRemotePtyConnection(conn);
    });
    this.remotePtyHeartbeatInterval = setInterval(() => {
      // we always do this (basically a no-op) even if there
      // is no remote pty.
      this.remotePty?.write({});
    }, REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS);
  }

  init = async () => {
    await this.initLocalPty();
  };

  private initLocalPty = async () => {
    if (this.state == "closed") {
      throw Error("terminal is closed");
    }
    const dbg = (...args) => {
      logger.debug("initLocalPty: ", ...args);
    };
    if (this.remotePty != null) {
      dbg("don't init local pty since there is a remote one.");
      return;
    }
    if (this.localPty != null) {
      dbg("don't init local pty since there is already a local one.");
      return;
    }

    const args: string[] = [];

    const { options } = this;
    if (options.args != null) {
      for (const arg of options.args) {
        if (typeof arg === "string") {
          args.push(arg);
        } else {
          dbg("WARNING -- discarding invalid non-string arg ", arg);
        }
      }
    } else {
      const initFilename: string = console_init_filename(this.path);
      if (await exists(initFilename)) {
        args.push("--init-file");
        args.push(path_split(initFilename).tail);
      }
    }
    if (this.remotePty) {
      // switched to a different remote so don't finish initializing a local one
      // (we check after each async call)
      return;
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
      dbg("WARNING: failed to load", this.path, err);
    }
    if (this.remotePty) {
      // switched to a different remote, so don't finish initializing a local one
      return;
    }

    this.setComputeServerId(0);
    dbg("spawn", {
      command,
      args,
      cwd,
      size: this.size ? this.size : "size not defined",
    });
    const localPty = spawn(command, args, {
      cwd,
      env,
      rows: this.size?.rows,
      cols: this.size?.cols,
    }) as IPty;
    dbg("pid=", localPty.pid, { command, args });
    this.localPty = localPty;

    localPty.onData(this.handleDataFromTerminal);
    localPty.onExit(async (exitInfo) => {
      dbg("exited with code ", exitInfo);
      this.handleDataFromTerminal(EXIT_MESSAGE);
      delete this.localPty;
    });
    //     if (command == "/bin/bash") {
    //       localPty.write("\nreset;history -d $(history 1)\n");
    //     }
    this.state = "ready";
    return localPty;
  };

  close = () => {
    logger.debug("close");
    if ((this.state as State) == "closed") {
      return;
    }
    this.state = "closed";
    this.killPty();
    this.localPty?.destroy();
    this.channel.destroy();
    this.remotePtyChannel.destroy();
    clearInterval(this.remotePtyHeartbeatInterval);
    delete this.localPty;
    delete this.remotePty;
  };

  getPid = (): number | undefined => {
    return this.localPty?.pid;
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
    // we track change
    this.options.command = command;
    this.options.args = args;
    if (this.remotePty != null) {
      // remote pty
      this.remotePty.write({ cmd: "set_command", command, args });
    } else if (this.localPty != null) {
      this.localPty.onExit(() => {
        this.initLocalPty();
      });
      this.killLocalPty();
    }
  };

  private killPty = () => {
    if (this.localPty != null) {
      this.killLocalPty();
    } else if (this.remotePty != null) {
      this.killRemotePty();
    }
  };

  private killLocalPty = () => {
    if (this.localPty == null) return;
    logger.debug("killing ", this.localPty.pid);
    this.localPty.kill("SIGKILL");
    this.localPty.destroy();
    delete this.localPty;
  };

  private killRemotePty = () => {
    if (this.remotePty == null) return;
    this.remotePty.write({ cmd: "kill" });
  };

  private setSizePty = (rows: number, cols: number) => {
    if (this.localPty != null) {
      this.localPty.resize(cols, rows);
    } else if (this.remotePty != null) {
      this.remotePty.write({ cmd: "size", rows, cols });
    }
  };

  private saveHistoryToDisk = throttle(async () => {
    const target = join(this.getHome(), this.path);
    try {
      await writeFile(target, this.history);
    } catch (err) {
      logger.debug(
        `WARNING: failed to save terminal history to '${target}'`,
        err,
      );
    }
  }, 15000);

  private resetBackendMessagesBuffer = () => {
    this.backendMessagesBuffer = "";
    this.backendMessagesState = "none";
  };

  private handleDataFromTerminal = (data) => {
    //console.log("handleDataFromTerminal", { data });
    if (this.state == "closed") return;
    //logger.debug("terminal: term --> browsers", data);
    this.handleBackendMessages(data);
    this.history += data;
    const n = this.history.length;
    if (n >= MAX_HISTORY_LENGTH) {
      logger.debug("terminal data -- truncating");
      this.history = this.history.slice(n - MAX_HISTORY_LENGTH / 2);
      const last = this.last_truncate_time;
      const now = Date.now();
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
          this.localPty?.write("\u0003");
        }
        return;
      } else {
        this.truncating = 0;
      }
    }
    this.saveHistoryToDisk();
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

  getSize = (): { rows: number; cols: number } | undefined => {
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

  private resize = () => {
    if (this.state == "closed") return;
    //logger.debug("resize");
    if (this.localPty == null && this.remotePty == null) {
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
      this.setSizePty(rows, cols);
      // broadcast out new size to all clients
      this.channel.write({ cmd: "size", rows, cols });
    } catch (err) {
      logger.debug("terminal channel -- WARNING: unable to resize term", err);
    }
  };

  private setComputeServerId = (id: number) => {
    this.computeServerId = id;
    this.channel.write({ cmd: "computeServerId", id });
  };

  private sendCurrentWorkingDirectory = async (spark: Spark) => {
    if (this.localPty != null) {
      await this.sendCurrentWorkingDirectoryLocalPty(spark);
    } else if (this.remotePty != null) {
      await this.sendCurrentWorkingDirectoryRemotePty(spark);
    }
  };

  private getHome = () => {
    return process.env.HOME ?? "/home/user";
  };

  private sendCurrentWorkingDirectoryLocalPty = async (spark: Spark) => {
    if (this.localPty == null) {
      return;
    }
    // we reply with the current working directory of the underlying terminal process,
    // which is why we use readlink and proc below.
    const pid = this.localPty.pid;
    // [hsy/dev] wrapping in realpath, because I had the odd case, where the project's
    // home included a symlink, hence the "startsWith" below didn't remove the home dir.
    const home = await realpath(this.getHome());
    const cwd = await readlink(`/proc/${pid}/cwd`);
    // try to send back a relative path, because the webapp does not
    // understand absolute paths
    const path = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
    logger.debug("terminal cwd sent back", { path });
    spark.write({ cmd: "cwd", payload: path });
  };

  private sendCurrentWorkingDirectoryRemotePty = async (spark: Spark) => {
    if (this.remotePty == null) {
      return;
    }
    // Write cwd command, then wait for a cmd:'cwd' response, and
    // forward it to the spark.
    this.remotePty.write({ cmd: "cwd" });
    const handle = (mesg) => {
      if (typeof mesg == "object" && mesg.cmd == "cwd") {
        spark.write(mesg);
        this.remotePty?.removeListener("data", handle);
      }
    };
    this.remotePty.addListener("data", handle);
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
    // broadcast message to all clients telling them to close, but
    // telling requestor to ignore.
    spark.write({ cmd: "close", ignore: spark.id });
  };

  private writeToPty = async (data) => {
    if (this.state == "closed") return;
    // only for VERY low level debugging:
    // logger.debug("writeToPty", { data });
    if (this.localPty != null) {
      this.localPty.write(data);
    } else if (this.remotePty != null) {
      this.remotePty.write(data);
    } else {
      logger.debug("no pty active, but got data, so let's spawn one locally");
      const pty = await this.initLocalPty();
      if (pty != null) {
        // we delete first character since it is the "any key"
        // user hit to get terminal going.
        pty.write(data.slice(1));
      }
    }
  };

  private handleDataFromClient = async (
    spark,
    data: string | ClientCommand,
  ) => {
    //logger.debug("terminal: browser --> term", JSON.stringify(data));
    if (typeof data === "string") {
      this.writeToPty(data);
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
    if (this.localPty == null && this.remotePty == null) {
      await this.initLocalPty();
    }
    switch (data.cmd) {
      case "size":
        this.setSize(spark, { rows: data.rows, cols: data.cols });
        break;

      case "set_command":
        this.setCommand(data.command, data.args);
        break;

      case "kill":
        // send kill signal
        this.killPty();
        break;

      case "cwd":
        try {
          await this.sendCurrentWorkingDirectory(spark);
        } catch (err) {
          logger.debug(
            "WARNING -- issue getting current working directory",
            err,
          );
          // TODO: the terminal protocol doesn't even have a way
          // to report that an error occured, so this silently
          // fails. It's just for displaying the current working
          // directory, so not too critical.
        }
        break;

      case "boot": {
        this.bootAllOtherClients(spark);
        break;
      }
    }
  };

  private handleClientConnection = (spark: Spark) => {
    logger.debug(
      this.path,
      `new client connection from ${spark.address.ip} -- ${spark.id}`,
    );

    // send current size info
    if (this.size != null) {
      const { rows, cols } = this.size;
      spark.write({ cmd: "size", rows, cols });
    }

    spark.write({ cmd: "computeServerId", id: this.computeServerId });

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

  // inform remote pty client of the exact options that are current here.
  private initRemotePty = () => {
    if (this.remotePty == null) return;
    this.remotePty.write({
      cmd: "init",
      options: this.options,
      size: this.getSize(),
    });
  };

  private handleRemotePtyConnection = (remotePty: Spark) => {
    logger.debug(
      this.path,
      `new pty connection from ${remotePty.address.ip} -- ${remotePty.id}`,
    );
    if (this.remotePty != null) {
      // already an existing remote connection
      // Remove listeners and end it.  We have to
      // remove listeners or calling end will trigger
      // the remotePty.on("end",...) below, which messes
      // up everything.
      this.remotePty.removeAllListeners();
      this.remotePty.end();
    }

    remotePty.on("end", async () => {
      if (this.state == "closed") return;
      logger.debug("ending existing remote terminal");
      delete this.remotePty;
      await this.initLocalPty();
    });

    remotePty.on("data", async (data) => {
      if ((this.state as State) == "closed") return;
      if (typeof data == "string") {
        this.handleDataFromTerminal(data);
      } else {
        if (this.localPty != null) {
          // already switched back to local
          return;
        }
        if (typeof data == "object") {
          switch (data.cmd) {
            case "setComputeServerId":
              this.setComputeServerId(data.id);
              break;
            case "exit": {
              this.handleDataFromTerminal(EXIT_MESSAGE);
              break;
            }
          }
        }
      }
    });

    this.remotePty = remotePty;
    this.initRemotePty();
    this.killLocalPty();
  };
}
