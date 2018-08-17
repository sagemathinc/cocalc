// Returns the name of the channel.

const { spawn } = require("pty.js");

import { len } from "../smc-webapp/frame-editors/generic/misc";

const terminals = {};

const MAX_HISTORY_LENGTH: number = 100000;

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
  terminals[name] = { channel, history: "", client_sizes: {} };
  function init_term() {
    const term = spawn("/bin/bash", [], {});
    logger.debug("terminal", "init_term", name, "pid=", term.pid);
    terminals[name].term = term;
    term.on("data", function(data) {
      //logger.debug("terminal: term --> browsers", name, data);
      terminals[name].history += data;
      const n = terminals[name].history.length;
      if (n >= MAX_HISTORY_LENGTH) {
        terminals[name].history = terminals[name].history.slice(
          n - MAX_HISTORY_LENGTH / 2
        );
      }

      channel.write(data);
    });
    // Whenever term ends, we just respawn it.
    term.on("exit", function() {
      logger.debug("terminal", name, "EXIT");
      init_term();
    });
  }
  init_term();

  function resize() {
    logger.debug("resize");
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
    logger.debug("resize", "new size", rows, cols);
    terminals[name].term.resize(cols, rows);
    channel.write({ cmd: "size", rows: rows, cols: cols });
  }

  channel.on("connection", function(spark: any): void {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    // send history
    spark.write(terminals[name].history);
    // simple echo server for now.
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
        logger.debug("terminal channel control message", JSON.stringify(data));
        switch (data.cmd) {
          case "size":
            const size = (terminals[name].client_sizes[spark.id] = {
              rows: data.rows,
              cols: data.cols
            });
            resize();
            break;
        }
      }
    });
  });

  return name;
}
