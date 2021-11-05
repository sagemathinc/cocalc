/*
Initialize a TCP socket connection to a project.

This mainly involves setting up the socket to so we we can send and receive
message over it.
*/

import initHeartbeat from "./heartbeat";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("project-connection:initialize");

// misc_node is still in coffeescript :-(
//import { ... } from "@cocalc/backend/misc_node";
const {
  enable_mesg,
  keep_portforward_alive,
} = require("@cocalc/backend/misc_node");

export default function initialize(project_id: string, socket): void {
  logger.info("initializing socket");
  enable_mesg(socket, "connection_to_a_local_hub");
  socket.on("data", () => {
    keep_portforward_alive(address.port);
  });

  socket.on("mesg", (type, mesg) => {
    switch (type) {
      case "blob":
        handleBlob(project_id, mesg);
        return;
      case "json":
        handleMesg(project_id, mesg, socket);
        return;
      default:
        logger.warn("WARNING: unknown message type", type);
    }
  });

  socket.on("end", () => freeResources(project_id));
  socket.on("close", () => freeResources(project_id));
  socket.on("error", () => freeResources(project_id));

  // Send a hello message to the project.  I'm not sure if this is used for anything at all,
  // but it is nice to see in the logs.
  socket.write_mesg("json", { event: "hello" });

  //  start sending heartbeats over this socket, so project knows it is working.
  initHeartbeat(socket);
}
