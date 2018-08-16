// Returns the name of the channel.

const { spawn } = require("pty.js");

const terminals = {};

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
  terminals[name] = { channel };
  function init_term() {
    const term = spawn("/bin/bash", [], {});
    logger.debug("terminal", "init_term", name, "pid=", term.pid);
    terminals[name].term = term;
    term.on("data", function(data) {
      //logger.debug("terminal: term --> browsers", name, data);
      channel.write(data);
    });
    // Whenever term ends, we just respawn it.
    term.on("exit", function() {
      logger.debug("terminal", name, "EXIT");
      init_term();
    });
  }
  init_term();

  channel.on("connection", function(spark: any): void {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    // simple echo server for now.
    spark.on("data", function(data) {
      //logger.debug("terminal: browser --> term", name, JSON.stringify(data));
      if (typeof data === "string") {
        try {
          terminals[name].term.write(data);
        } catch (err) {
          spark.write(err.toString());
        }
      } else {
        // control message
        logger.debug("terminal channel control message");
      }
    });
  });

  return name;
}
