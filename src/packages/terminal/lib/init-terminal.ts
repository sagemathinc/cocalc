/*
Initialize a terminal session/file.
*/

import type { Terminal } from "./types";
import { console_init_filename, path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/backend/logger";
import { envForSpawn } from "@cocalc/backend/misc";
import { getCWD } from "./util";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node-pty";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { exists } from "@cocalc/backend/misc/async-utils-node";

const logger = getLogger("terminal:init-terminal");

const CHECK_INTERVAL_MS: number = 5 * 1000;
const MAX_HISTORY_LENGTH: number = 10 * 1000 * 1000;
const TRUNCATE_THRESH_MS: number = 10 * 1000;

export default async function initTerminal(terminal: Terminal) {
  const args: string[] = [];

  const { options } = terminal;
  if (options.args != null) {
    for (const arg of options.args) {
      if (typeof arg === "string") {
        args.push(arg);
      } else {
        logger.debug("WARNING -- discarding invalid non-string arg ", arg);
      }
    }
  } else {
    const initFilename: string = console_init_filename(terminal.path);
    if (await exists(initFilename)) {
      args.push("--init-file");
      args.push(path_split(initFilename).tail);
    }
  }

  const { head: pathHead, tail: pathTail } = path_split(terminal.path);
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
    terminal.history = (await readFile(terminal.path)).toString();
  } catch (err) {
    logger.debug("WARNING: failed to load", terminal.path, err);
  }
  const term = spawn(command, args, { cwd, env });
  logger.debug("pid=", term.pid, { command, args });
  terminal.term = term;

  const saveHistoryToDisk = throttle(async () => {
    try {
      await writeFile(terminal.path, terminal.history);
    } catch (err) {
      logger.debug("WARNING: failed to save terminal history to disk", err);
    }
  }, 15000);

  term.on("data", function (data): void {
    //logger.debug("terminal: term --> browsers", data);
    handleBackendMessages(data);
    terminal.history += data;
    saveHistoryToDisk();
    const n = terminal.history.length;
    if (n >= MAX_HISTORY_LENGTH) {
      logger.debug("terminal data -- truncating");
      terminal.history = terminal.history.slice(n - MAX_HISTORY_LENGTH / 2);
      const last = terminal.last_truncate_time;
      const now = new Date().valueOf();
      terminal.last_truncate_time = now;
      logger.debug(now, last, now - last, TRUNCATE_THRESH_MS);
      if (now - last <= TRUNCATE_THRESH_MS) {
        // getting a huge amount of data quickly.
        if (!terminal.truncating) {
          terminal.channel.write({ cmd: "burst" });
        }
        terminal.truncating += data.length;
        setTimeout(checkIfStillTruncating, CHECK_INTERVAL_MS);
        if (terminal.truncating >= 5 * MAX_HISTORY_LENGTH) {
          // only start sending control+c if output has been completely stuck
          // being truncated several times in a row -- it has to be a serious non-stop burst...
          term.write("\u0003");
        }
        return;
      } else {
        terminal.truncating = 0;
      }
    }
    if (!terminal.truncating) {
      terminal.channel.write(data);
    }
  });

  let backendMessagesState: "NONE" | "READING" = "NONE";
  let backendMessagesBuffer: string = "";

  const resetBackendMessagesBuffer = () => {
    backendMessagesBuffer = "";
    backendMessagesState = "NONE";
  };

  const handleBackendMessages = (data: string) => {
    /* parse out messages like this:
            \x1b]49;"valid JSON string here"\x07
         and format and send them via our json channel.
         NOTE: such messages also get sent via the
         normal channel, but ignored by the client.
      */
    if (backendMessagesState === "NONE") {
      const i = data.indexOf("\x1b");
      if (i === -1) {
        return; // nothing to worry about
      }
      // stringify it so it is easy to see what is there:
      backendMessagesState = "READING";
      backendMessagesBuffer = data.slice(i);
    } else {
      backendMessagesBuffer += data;
    }
    if (
      backendMessagesBuffer.length >= 5 &&
      backendMessagesBuffer.slice(1, 5) != "]49;"
    ) {
      resetBackendMessagesBuffer();
      return;
    }
    if (backendMessagesBuffer.length >= 6) {
      const i = backendMessagesBuffer.indexOf("\x07");
      if (i === -1) {
        // continue to wait... unless too long
        if (backendMessagesBuffer.length > 10000) {
          resetBackendMessagesBuffer();
        }
        return;
      }
      const s = backendMessagesBuffer.slice(5, i);
      resetBackendMessagesBuffer();
      logger.debug(
        `handle_backend_message: parsing JSON payload ${JSON.stringify(s)}`,
      );
      try {
        const payload = JSON.parse(s);
        terminal.channel.write({ cmd: "message", payload });
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

  function checkIfStillTruncating(): void {
    if (!terminal.truncating) return;
    if (
      new Date().valueOf() - terminal.last_truncate_time >=
      CHECK_INTERVAL_MS
    ) {
      // turn off truncating, and send recent data.
      const { truncating, history } = terminal;
      terminal.channel.write(history.slice(Math.max(0, history.length - truncating)));
      terminal.truncating = 0;
      terminal.channel.write({ cmd: "no-burst" });
    } else {
      setTimeout(checkIfStillTruncating, CHECK_INTERVAL_MS);
    }
  }

  // Whenever term ends, we just respawn it, but potentially
  // with a pause to avoid weird crash loops bringing down the project.
  term.on("exit", async function () {
    logger.debug("EXIT -- spawning again");
    const now = new Date().getTime();
    if (now - terminal.last_exit <= 15000) {
      // frequent exit; we wait a few seconds, since otherwisechannel
      // restarting could burn all cpu and break everything.
      logger.debug("EXIT -- waiting a few seconds before trying again...");
      await delay(3000);
    }
    terminal.last_exit = now;
    initTerminal(terminal);
  });
}
