/*
Terminal server
*/

const { spawn } = require("pty.js");

import { len, merge, path_split } from "../smc-webapp/frame-editors/generic/misc";
const { console_init_filename } = require("smc-util/misc");

import { exists } from "../jupyter/async-utils-node";

const terminals = {};

const MAX_HISTORY_LENGTH: number = 200000;
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
    const env = merge({COCALC_TERMINAL_FILENAME: s.tail}, process.env);
    const cwd = s.head;

    const term = spawn("/bin/bash", args, {cwd, env});
    logger.debug("terminal", "init_term", name, "pid=", term.pid, 'args', args);
    terminals[name].term = term;
    term.on("data", function(data) {
      //logger.debug("terminal: term --> browsers", name, data);
      terminals[name].history += data;
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
          if (terminals[name].truncating >= 5*MAX_HISTORY_LENGTH) {
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

    function check_if_still_truncating() {
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
    let rows: number = 10000,
      cols: number = 10000;
    for (let id in sizes) {
      rows = Math.min(rows, sizes[id].rows);
      cols = Math.min(cols, sizes[id].cols);
    }
    terminals[name].size = { rows, cols };
    //logger.debug("resize", "new size", rows, cols);
    terminals[name].term.resize(cols, rows);
    channel.write({ cmd: "size", rows, cols });
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
