/*

*/

import getLogger from "@cocalc/backend/logger";
import type { Spark } from "primus";
import type { PrimusChannel, PrimusWithChannels } from "@cocalc/terminal";
import {
  COMPUTE_SERVER_CHANNEL_NAME,
  WEB_BROWSER_CHANNEL_NAME,
} from "@cocalc/util/compute/manager";

const logger = getLogger("project:compute-server:manager");

class Manager {
  private computeServerChannel: PrimusChannel;
  private webBrowserChannel: PrimusChannel;

  constructor(primus: PrimusWithChannels) {
    logger.debug("initializing the manager");
    // connections with compute servers: they will provide compute
    this.computeServerChannel = primus.channel(COMPUTE_SERVER_CHANNEL_NAME);
    this.computeServerChannel.on(
      "connection",
      this.handleComputeServerConnection,
    );

    // connections with web browsers: they will request things to get done using compute, get info about attached computed servers, etc.
    this.webBrowserChannel = primus.channel(WEB_BROWSER_CHANNEL_NAME);
    this.webBrowserChannel.on("connection", this.handleWebBrowserConnection);
  }

  private handleComputeServerConnection = (spark: Spark) => {
    logger.debug(
      `new compute server connection from ${spark.address.ip} -- ${spark.id}`,
    );
    spark.write({ status: "ok", type: "compute server browser" });
    spark.on("data", (mesg) =>
      this.handleMessageFromComputeServer(spark, mesg),
    );
  };

  private handleMessageFromComputeServer = (spark: Spark, message) => {
    logger.debug("handleMessageFromComputeServer", spark.id, message);
    spark.write({ response: "message received from compute server", message });
  };

  private handleWebBrowserConnection = (spark: Spark) => {
    logger.debug(
      `new web browser connection from ${spark.address.ip} -- ${spark.id}`,
    );
    spark.write({ status: "ok", type: "web browser" });
    spark.on("data", (mesg) => this.handleMessageFromWebBrowser(spark, mesg));
  };

  private handleMessageFromWebBrowser = (spark: Spark, message) => {
    logger.debug("handleMessageFromWebBrowser", spark.id, message);
    spark.write({ response: "message received from web browser", message });
  };
}

let manager: Manager | undefined = undefined;
export function initManager(primus: PrimusWithChannels) {
  if (manager != null) {
    throw Error("attempt to initialize manager twice");
  }
  manager = new Manager(primus);
}
