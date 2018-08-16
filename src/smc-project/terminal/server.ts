// Returns the name of the channel.

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
  terminals[name] = channel;
  channel.on("connection", function(spark: any): void {
    // Now handle the connection
    logger.debug(
      "terminal channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    // simple echo server for now.
    spark.on("data", function(data) {
      logger.debug("terminal channel", name, JSON.stringify(data));
      try {
        channel.write(data);
      } catch (err) {
        spark.write(err.toString());
      }
    });
  });

  return name;
}
