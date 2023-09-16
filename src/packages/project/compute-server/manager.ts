/*

*/

import getLogger from "@cocalc/backend/logger";
import type { Spark } from "primus";
import type { PrimusChannel, PrimusWithChannels } from "@cocalc/terminal";

const logger = getLogger("project:compute-server:manager");
const CHANNEL_NAME = "compute-server";

class Manager {
  private channel: PrimusChannel;

  constructor(primus: PrimusWithChannels) {
    logger.debug("initializing the manager");
    this.channel = primus.channel(CHANNEL_NAME);
    this.channel.on("connection", this.handleClientConnection);
  }

  private handleClientConnection = (spark: Spark) => {
    logger.debug(
      `new client connection from ${spark.address.ip} -- ${spark.id}`,
    );
    spark.write({ status: "ok" });
  };
}

let manager: Manager | undefined = undefined;
export function initManager(primus: PrimusWithChannels) {
  if (manager != null) {
    throw Error("attempt to initialize manager twice");
  }
  manager = new Manager(primus);
}
