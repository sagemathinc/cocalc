/*
Terminal server
*/

const { spawn } = require("node-pty");
import { readFile, writeFile } from "fs";

import {
  len,
  merge,
  path_split
} from "../smc-webapp/frame-editors/generic/misc";
const { console_init_filename } = require("smc-util/misc");

import { exists } from "../jupyter/async-utils-node";

import { throttle } from "underscore";

import { callback } from "awaiting";

const terminals = {};

const MAX_HISTORY_LENGTH: number = 500000;
const truncate_thresh_ms: number = 500;
const check_interval_ms: number = 3000;

export async function terminal(
  primus: any,
  logger: any,
  path: string,
  options: object
): Promise<string> {
  const name = `terminal:${path}`;
  if (terminals[name] !== undefined) {
    return name;
  }
  const channel = primus.channel(name);
  terminals[name] = {
    channel,
    history: "",
    client_sizes: {},
    last_truncate_time: new Date().valueOf(),
    truncating: 0
  };
  async function init_term() {
    const args: string[] = [];

    const init_filename: string = console_init_filename(path);
    if (await exists(init_filename)) {
      args.push("--init-file");
      args.push(path_split(init_filename).tail);
    }

    const s = path_split(path);
    const env = merge({ COCALC_TERMINAL_FILENAME: s.tail }, process.env);
    const cwd = s.head;

    try {
      terminals[name].history = (await callback(readFile, path)).toString();
    } catch (err) {
      console.log(`failed to load ${path} from disk`);
    }
    const term = spawn("/bin/bash", args, { cwd, env });
    logger.debug("terminal", "init_term", name, "pid=", term.pid, "args", args);
    terminals[name].term = term;

    const save_history_to_disk = throttle(async () => {
      try {
        await callback(writeFile, path, terminals[name].history);
      } catch (err) {
        console.log(`failed to save ${path} to disk`);
      }
    }, 15000);

    term.on("data", function(data): void {
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
        try {
          const payload = JSON.parse(s);
          channel.write({ cmd: "message", payload });
        } catch (err) {
          // no op -- ignore
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
    term.on("exit", function() {
      logger.debug("terminal", name, "EXIT");
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
    for (let id in sizes) {
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
      terminals[name].term.resize(cols, rows);
      channel.write({ cmd: "size", rows, cols });
    }
  }

  channel.on("connection", function(spark: any): void {
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
    spark.on("close", function() {
      delete terminals[name].client_sizes[spark.id];
      resize();
    });
    spark.on("end", function() {
      delete terminals[name].client_sizes[spark.id];
      resize();
    });
    spark.on("data", function(data) {
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
            const size = (terminals[name].client_sizes[spark.id] = {
              rows: data.rows,
              cols: data.cols
            });
            resize();
            break;
          case "boot":
            // delete all sizes except this one, so at least kick resets
            // the sizes no matter what.
            for (let id in terminals[name].client_sizes) {
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
            channel.forEach(function(spark0, id, connections) {
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
