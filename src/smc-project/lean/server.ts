/*
LEAN server
*/

const lean_files = {};

export async function lean(
  client: any,
  primus: any,
  logger: any,
  path: string
): Promise<string> {
  const name = `lean:${path}`;
  if (lean_files[name] !== undefined) {
    return name;
  }
  const channel = primus.channel(name);
  lean_files[name] = {
    channel,
    state: { nothing: "yet" }
  };

  channel.on("connection", function(spark: any): void {
    const lean_file = lean_files[name];
    if (lean_file === undefined) {
      return;
    }
    // Now handle the connection
    logger.debug(
      "lean channel",
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    spark.write(lean_file.state);
    spark.on("end", function() {});
    spark.on("data", function(data) {
      if (typeof data === "object") {
        // control message
        logger.debug("lean_file channel control message", JSON.stringify(data));
        switch (data.cmd) {
        }
      }
    });
  });

  return name;
}
