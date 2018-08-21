interface JupyterChannel {
  name: string;
  channel: any;
}

const jupyters: { [key: string]: JupyterChannel } = {};

export async function websocket_channel(
  primus: any,
  logger: any,
  path: string,
  options: object
): Promise<JupyterChannel> {
  const name = `jupyter:${path}`;
  if (jupyters[name] !== undefined) {
    return jupyters[name];
  }
  const channel = primus.channel(name);
  jupyters[name] = {
    name,
    channel
  };

  init(channel, logger, options, name);
  return jupyters[name];
}

function init(channel: any, logger: any, options: object, name: string): void {
  channel.on("connection", function(spark: any): void {
    // Now handle the connection
    logger.debug(
      "jupyter channel",
      name,
      `new connection from ${spark.address.ip} -- ${spark.id}`
    );
    spark.on("data", function(data) {
      logger.debug("got data -- now echoing to ALL");
      channel.write(data);
    });
  });
  setInterval(function() {
    logger.debug("write to jupyter channel");
    channel.write("something from jupyter");
  }, 3000);
}

/* End the channel with given name. */
function end(name: string) : void {
  const x = jupyters[name];
  if (x == null) {
    return;
  }
  x.channel.end();  // TODO: does this make any sense?
  delete jupyters[name];
}