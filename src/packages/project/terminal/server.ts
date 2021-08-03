/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Terminal server
*/

const { spawn } = require("node-pty");
import { readFile, writeFile } from "fs";
import { promises as fsPromises } from "fs";
const { readlink } = fsPromises;
import { console_init_filename, len, merge, path_split } from "smc-util/misc";
import { exists } from "../jupyter/async-utils-node";
import { isEqual, throttle } from "lodash";
import { callback, delay } from "awaiting";

interface Terminal {
  channel: any;
  history: string;
  client_sizes?: any;
  last_truncate_time: number;
  truncating: number;
  last_exit: number;
  options: {
    path?: string; // this is the "original" path to the terminal, not the derived "term_path"
    command?: string;
    args?: string[];
    env?: { [key: string]: string };
  };
  size?: any;
  term?: any; // node-pty
}

const PREFIX = "terminal:";
const terminals: { [name: string]: Terminal } = {};

const MAX_HISTORY_LENGTH: number = 500000;
const truncate_thresh_ms: number = 500;
const check_interval_ms: number = 3000;

// this is used to know which process belongs to which terminal
export function pid2path(pid: number): string | undefined {
  for (const term of Object.values(terminals)) {
    if (term.term?.pid == pid) {
      return term.options.path;
    }
  }
}

export async function terminal(
  primus: any,
  logger: any,
  path: string,
  options: any
): Promise<string> {
  const name = `${PREFIX}${path}`;
  if (terminals[name] !== undefined) {
    if (options.command != terminals[name].options.command) {
      terminals[name].options.command = options.command;
      terminals[name].options.args = options.args;
      process.kill(terminals[name].term.pid, "SIGKILL");
    }
    return name;
  }
  const channel = primus.channel(name);
  terminals[name] = {
    channel,
    history: "",
    client_sizes: {},
    last_truncate_time: new Date().valueOf(),
    truncating: 0,
    last_exit: 0,
    options: options ?? {},
  };

  async function init_term() {
    const args: string[] = [];

    const options = terminals[name].options;
    if (options.args != null) {
      for (const arg of options.args) {
        if (typeof arg === "string") {
          args.push(arg);
        }
      }
    } else {
      const init_filename: string = console_init_filename(path);
      if (await exists(init_filename)) {
        args.push("--init-file");
        args.push(path_split(init_filename).tail);
      }
    }

    const s = path_split(path);
    const env = merge({ COCALC_TERMINAL_FILENAME: s.tail }, process.env);
    if (options.env != null) {
      merge(env, options.env);
    }
    if (env.TMUX) {
      // If TMUX was set for some reason in the environment that setup
      // a cocalc project (e.g., start hub in dev mode from tmux), then
      // TMUX is set even though terminal hasn't started tmux yet, which
      // confuses our open command.  So we explicitly unset it here.
      // https://unix.stackexchange.com/questions/10689/how-can-i-tell-if-im-in-a-tmux-session-from-a-bash-script
      delete env["TMUX"];
    }

    const command = options.command ? options.command : "/bin/bash";
    const cwd = s.head;

    try {
      terminals[name].history = (await callback(readFile, path)).toString();
    } catch (err) {
      console.log(`failed to load ${path} from disk`);
    }
    const term = spawn(command, args, { cwd, env });
    logger.debug(
      "terminal",
      "init_term",
      name,
      "pid=",
      term.pid,
      "command=",
      command,
      "args",
      args
    );
    terminals[name].term = term;

    const save_history_to_disk = throttle(async () => {
      try {
        await callback(writeFile, path, terminals[name].history);
      } catch (err) {
        console.log(`failed to save ${path} to disk`);
      }
    }, 15000);

    term.on("data", function (data): void {
      //logger.debug("terminal: term --> browsers", name, data);
      handle_backend_messages(data);
      terminals[name].history += data;
      save_history_to_disk();
      const n = terminals[name].history.length;
      if (n >= MAX_HISTORY_LENGTH) {
        logger.debug("terminal data -- truncating");
        terminals[name].history = terminals[name].history.slice(
          n - MAX_HISTORY_LENGTH / 2
        );
        const last = terminals[name].last_truncate_time;
        const now = new Date().valueOf();
        terminals[name].last_truncate_time = now;
        logger.debug("terminal", now, last, now - last, truncate_thresh_ms);
        if (now - last <= truncate_thresh_ms) {
          // getting a huge amount of data quickly.
          if (!terminals[name].truncating) {
            channel.write({ cmd: "burst" });
          }
          terminals[name].truncating += data.length;
          setTimeout(check_if_still_truncating, check_interval_ms);
          if (terminals[name].truncating >= 5 * MAX_HISTORY_LENGTH) {
            // only start sending control+c if output has been completely stuck
            // being truncated several times in a row -- it has to be a serious non-stop burst...
            term.write("\u0003");
          }
          return;
        } else {
          terminals[name].truncating = 0;
        }
      }
      if (!terminals[name].truncating) {
        channel.write(data);
      }
    });

    let backend_messages_state: "NONE" | "READING" = "NONE";
    let backend_messages_buffer: string = "";
    function reset_backend_messages_buffer(): void {
      backend_messages_buffer = "";
      backend_messages_state = "NONE";
    }
    function handle_backend_messages(data: string): void {
      /* parse out messages like this:
            \x1b]49;"valid JSON string here"\x07
         and format and send them via our json channel.
         NOTE: such messages also get sent via the
         normal channel, but ignored by the client.
      */
      if (backend_messages_state === "NONE") {
        const i = data.indexOf("\x1b");
        if (i === -1) {
          return; // nothing to worry about
        }
        // stringify it so it is easy to see what is there:
        backend_messages_state = "READING";
        backend_messages_buffer = data.slice(i);
      } else {
        backend_messages_buffer += data;
      }
      if (
        backend_messages_buffer.length >= 5 &&
        backend_messages_buffer.slice(1, 5) != "]49;"
      ) {
        reset_backend_messages_buffer();
        return;
      }
      if (backend_messages_buffer.length >= 6) {
        const i = backend_messages_buffer.indexOf("\x07");
        if (i === -1) {
          // continue to wait... unless too long
          if (backend_messages_buffer.length > 10000) {
            reset_backend_messages_buffer();
          }
          return;
        }
        const s = backend_messages_buffer.slice(5, i);
        reset_backend_messages_buffer();
        logger.debug(
          `handle_backend_message: parsing JSON payload ${JSON.stringify(s)}`
        );
        try {
          const payload = JSON.parse(s);
          channel.write({ cmd: "message", payload });
        } catch (err) {
          logger.warn(
            `handle_backend_message: error sending JSON payload ${JSON.stringify(
              s
            )}, ${err}`
          );
          // Otherwise, ignore...
        }
      }
    }

    function check_if_still_truncating(): void {
      if (!terminals[name].truncating) return;
      if (
        new Date().valueOf() - terminals[name].last_truncate_time >=
        check_interval_ms
      ) {
        // turn off truncating, and send recent data.
        const { truncating, history } = terminals[name];
        channel.write(history.slice(Math.max(0, history.length - truncating)));
        terminals[name].truncating = 0;
        channel.write({ cmd: "no-burst" });
      } else {
        setTimeout(check_if_still_truncating, check_interval_ms);
      }
    }

    // Whenever term ends, we just respawn it.
    term.on("exit", async function () {
      logger.debug("terminal", name, "EXIT -- spawning again");
      const now = new Date().getTime();
      if (now - terminals[name].last_exit <= 15000) {
        // frequent exit; we wait a few seconds, since otherwise
        // restarting could burn all cpu and break everything.
        logger.debug(
          "terminal",
          name,
          "EXIT -- waiting a few seconds before trying again..."
        );
        await delay(3000);
      }
      terminals[name].last_exit = now;
      init_term();
    });

    // set the size
    resize();
  }
  await init_term();

  function resize() {
    //logger.debug("resize");
    if (
      terminals[name] === undefined ||
      terminals[name].client_sizes === undefined ||
      terminals[name].term === undefined
    ) {
      return;
    }
    const sizes = terminals[name].client_sizes;
    if (len(sizes) === 0) return;
    const INFINITY = 999999;
    let rows: number = INFINITY,
      cols: number = INFINITY;
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
      delete terminals[name].size;
      return;
    }
    //logger.debug("resize", "new size", rows, cols);
    if (rows && cols) {
      try {
        terminals[name].term.resize(cols, rows);
      } catch (err) {
        logger.debug(
          "terminal channel",
          `WARNING: unable to resize term ${err}`
        );
      }
      channel.write({ cmd: "size", rows, cols });
    }
  }

  channel.on("connection", function (spark: any): void {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    // send current size info
    if (terminals[name].size !== undefined) {
      const { rows, cols } = terminals[name].size;
      spark.write({ cmd: "size", rows, cols });
    }
    // send burst info
    if (terminals[name].truncating) {
      spark.write({ cmd: "burst" });
    }
    // send history
    spark.write(terminals[name].history);
    // have history, so do not ignore commands now.
    spark.write({ cmd: "no-ignore" });
    spark.on("close", function () {
      delete terminals[name].client_sizes[spark.id];
      resize();
    });
    spark.on("end", function () {
      delete terminals[name].client_sizes[spark.id];
      resize();
    });
    spark.on("data", async function (data) {
      //logger.debug("terminal: browser --> term", name, JSON.stringify(data));
      if (typeof data === "string") {
        try {
          terminals[name].term.write(data);
        } catch (err) {
          spark.write(err.toString());
        }
      } else if (typeof data === "object") {
        // control message
        //logger.debug("terminal channel control message", JSON.stringify(data));
        switch (data.cmd) {
          case "size":
            terminals[name].client_sizes[spark.id] = {
              rows: data.rows,
              cols: data.cols,
            };
            try {
              resize();
            } catch (err) {
              // no-op -- can happen if terminal is restarting.
              logger.debug("terminal size", name, terminals[name].options, err);
            }
            break;

          case "set_command":
            if (
              isEqual(
                [data.command, data.args],
                [terminals[name].options.command, terminals[name].options.args]
              )
            ) {
              // no actual change.
              break;
            }
            terminals[name].options.command = data.command;
            terminals[name].options.args = data.args;
            // Also kill it so will respawn with new command/args:
            process.kill(terminals[name].term.pid, "SIGKILL");
            break;

          case "kill":
            // send kill signal
            process.kill(terminals[name].term.pid, "SIGKILL");
            break;

          case "cwd":
            // we reply with the current working directory of the underlying terminal process
            const pid = terminals[name].term.pid;
            const home = process.env.HOME ?? "/home/user";
            try {
              const cwd = await readlink(`/proc/${pid}/cwd`);
              logger.debug(`terminal cwd sent back: ${cwd}`);
              // we send back a relative path, because the webapp does not understand absolute paths
              const path = cwd.startsWith(home)
                ? cwd.slice(home.length + 1)
                : cwd;
              spark.write({ cmd: "cwd", payload: path });
            } catch {
              // ignoring errors
            }
            break;

          case "boot":
            // delete all sizes except this one, so at least kick resets
            // the sizes no matter what.
            for (const id in terminals[name].client_sizes) {
              if (id !== spark.id) {
                delete terminals[name].client_sizes[id];
              }
            }
            // next tell this client to go fullsize.
            if (terminals[name].size !== undefined) {
              const { rows, cols } = terminals[name].size;
              if (rows && cols) {
                spark.write({ cmd: "size", rows, cols });
              }
            }
            // broadcast message to all other clients telling them to close.
            channel.forEach(function (spark0, id, _) {
              if (id !== spark.id) {
                spark0.write({ cmd: "close" });
              }
            });
            break;
        }
      }
    });
  });

  return name;
}
