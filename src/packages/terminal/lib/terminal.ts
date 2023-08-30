import type { Options } from "./types";
import { getName } from "./util";
import { console_init_filename, len, path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/backend/logger";
import { envForSpawn } from "@cocalc/backend/misc";
import { getCWD } from "./util";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node-pty";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { exists } from "@cocalc/backend/misc/async-utils-node";

const logger = getLogger("terminal:terminal");

const CHECK_INTERVAL_MS: number = 5 * 1000;
const MAX_HISTORY_LENGTH: number = 10 * 1000 * 1000;
const TRUNCATE_THRESH_MS: number = 10 * 1000;
const INFINITY = 999999;

export class Terminal {
  public options: Options;
  public channel;
  public history: string = "";
  public path: string;
  public client_sizes = {};
  public last_truncate_time: number = Date.now();
  public truncating: number = 0;
  public last_exit: number = 0;
  public size?: any;
  public term?: any; // node-pty
  private backendMessagesBuffer = "";
  private backendMessagesState: "NONE" | "READING" = "NONE";

  constructor(primus, path: string, options: Options) {
    const name = getName(path);
    this.options = options;
    this.path = path;
    this.channel = primus.channel(name);
  }

  init = async () => {
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

    const { command = "/bin/bash" } = options;
    const cwd = getCWD(pathHead, options.cwd);

    try {
      this.history = (await readFile(this.path)).toString();
    } catch (err) {
      logger.debug("WARNING: failed to load", this.path, err);
    }
    const term = spawn(command, args, { cwd, env });
    logger.debug("pid=", term.pid, { command, args });
    this.term = term;

    term.on("data", this.handleData);

    // Whenever term ends, we just respawn it, but potentially
    // with a pause to avoid weird crash loops bringing down the project.
    term.on("exit", async () => {
      logger.debug("EXIT -- spawning again");
      const now = Date.now();
      if (now - this.last_exit <= 15000) {
        // frequent exit; we wait a few seconds, since otherwisechannel
        // restarting could burn all cpu and break everything.
        logger.debug("EXIT -- waiting a few seconds before trying again...");
        await delay(3000);
      }
      this.last_exit = now;
      this.init();
    });
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
    this.backendMessagesState = "NONE";
  };

  private handleData = (data) => {
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
    if (this.backendMessagesState === "NONE") {
      const i = data.indexOf("\x1b");
      if (i === -1) {
        return; // nothing to worry about
      }
      // stringify it so it is easy to see what is there:
      this.backendMessagesState = "READING";
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

  resize = () => {
    //logger.debug("resize");
    if (this.client_sizes == null || this.term == null) {
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
    //logger.debug("resize", "new size", rows, cols);
    if (rows && cols) {
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
}
