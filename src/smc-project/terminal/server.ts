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
  const term = spawn("/bin/bash", [], {});
  term.on("data", function(data) {
    logger.debug("terminal: term --> browsers", name, data);
    channel.write(data)
  });
  terminals[name] = { channel, term };

  channel.on("connection", function(spark: any): void {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    // simple echo server for now.
    spark.on("data", function(data) {
      logger.debug("terminal: browser --> term", name, JSON.stringify(data));
      if (typeof data === "string") {
        try {
          term.write(data);
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
