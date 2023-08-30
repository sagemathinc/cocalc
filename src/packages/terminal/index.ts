/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Terminal server
*/

import { isEqual } from "lodash";
import { readlink, realpath } from "node:fs/promises";
import { getLogger } from "@cocalc/backend/logger";
import Primus, { Spark } from "primus";
import type { Options } from "./lib/types";
import { getName } from "./lib/util";
import { Terminal } from "./lib/terminal";

const logger = getLogger("terminal:index");

const terminals: { [name: string]: Terminal } = {};

// this is used to know which process belongs to which terminal
export function pidToPath(pid: number): string | undefined {
  for (const term of Object.values(terminals)) {
    if (term.term?.pid == pid) {
      return term.options.path;
    }
  }
}

// INPUT: primus and description of a terminal session (the path)
// OUTPUT: the name of a websocket channel that serves that terminal session.
export async function terminal(
  primus: Primus,
  path: string,
  options: Options,
): Promise<string> {
  const name = getName(path);
  if (terminals[name] != null) {
    if (options.command != terminals[name].options.command) {
      terminals[name].options.command = options.command;
      terminals[name].options.args = options.args;
      process.kill(terminals[name].term.pid, "SIGKILL");
    }
    return name;
  }

  const terminal = new Terminal(primus, path, options);
  terminals[name] = terminal;
  await terminal.init();

  // set the size
  terminal.resize();

  terminal.channel.on("connection", (spark: Spark) => {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`,
    );

    // send current size info
    if (terminal.size !== undefined) {
      const { rows, cols } = terminal.size;
      spark.write({ cmd: "size", rows, cols });
    }

    // send burst info
    if (terminal.truncating) {
      spark.write({ cmd: "burst" });
    }

    // send history
    spark.write(terminal.history);

    // have history, so do not ignore commands now.
    spark.write({ cmd: "no-ignore" });

    spark.on("end", () => {
      delete terminal.client_sizes[spark.id];
      terminal.resize();
    });

    spark.on("data", async (data) => {
      //logger.debug("terminal: browser --> term", name, JSON.stringify(data));
      if (typeof data === "string") {
        try {
          terminal.term.write(data);
        } catch (err) {
          spark.write(err.toString());
        }
      } else if (typeof data === "object") {
        // control message
        //logger.debug("terminal channel control message", JSON.stringify(data));
        switch (data.cmd) {
          case "size":
            terminal.client_sizes[spark.id] = {
              rows: data.rows,
              cols: data.cols,
            };
            try {
              terminal.resize();
            } catch (err) {
              // no-op -- can happen if terminal is restarting.
              logger.debug("terminal size", name, terminal.options, err);
            }
            break;

          case "set_command":
            if (
              isEqual(
                [data.command, data.args],
                [terminal.options.command, terminal.options.args],
              )
            ) {
              // no actual change.
              break;
            }
            terminal.options.command = data.command;
            terminal.options.args = data.args;
            // Also kill it so will respawn with new command/args:
            process.kill(terminal.term.pid, "SIGKILL");
            break;

          case "kill":
            // send kill signal
            process.kill(terminal.term.pid, "SIGKILL");
            break;

          case "cwd":
            // we reply with the current working directory of the underlying terminal process
            const pid = terminal.term.pid;
            // [hsy/dev] wrapping in realpath, because I had the odd case, where the project's
            // home included a symlink, hence the "startsWith" below didn't remove the home dir.
            const home = await realpath(process.env.HOME ?? "/home/user");
            try {
              const cwd = await readlink(`/proc/${pid}/cwd`);
              // we send back a relative path, because the webapp does not understand absolute paths
              const path = cwd.startsWith(home)
                ? cwd.slice(home.length + 1)
                : cwd;
              logger.debug(`terminal cwd sent back: cwd=${cwd} path=${path}`);
              spark.write({ cmd: "cwd", payload: path });
            } catch {
              // ignoring errors
            }
            break;

          case "boot":
            // delete all sizes except this one, so at least kick resets
            // the sizes no matter what.
            for (const id in terminal.client_sizes) {
              if (id !== spark.id) {
                delete terminal.client_sizes[id];
              }
            }
            // next tell this client to go fullsize.
            if (terminal.size !== undefined) {
              const { rows, cols } = terminal.size;
              if (rows && cols) {
                spark.write({ cmd: "size", rows, cols });
              }
            }
            // broadcast message to all other clients telling them to close.
            terminal.channel.forEach((spark0, id, _) => {
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
