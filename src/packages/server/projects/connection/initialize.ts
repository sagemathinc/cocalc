/*
Initialize a TCP socket connection to a project.

This mainly involves setting up the socket to so we we can send and receive
message over it.
*/

import getLogger from "@cocalc/backend/logger";
import handleBlob from "./handle-blob";
import handleMessage from "./handle-message";
import initHeartbeat from "./heartbeat";

import enableMessagingProtocol, {
  CoCalcSocket,
} from "@cocalc/backend/tcp/enable-messaging-protocol";

const logger = getLogger("project-connection:initialize");

export default function initialize(
  project_id: string,
  socket: CoCalcSocket
): void {
  logger.info("initializing socket");
  enableMessagingProtocol(socket, "connection_to_a_local_hub");

  socket.on("mesg", (type, mesg) => {
    switch (type) {
      case "blob":
        handleBlob({
          socket,
          project_id,
          uuid: mesg.uuid,
          blob: mesg.blob,
          ttlSeconds: mesg.ttlSeconds,
        });
        return;
      case "json":
        handleMessage({ socket, project_id, mesg });
        return;
      default:
        logger.warn("WARNING: unknown message type", type);
    }
  });

  // Send a hello message to the project.  I'm not sure if this is used for anything at all,
  // but it is nice to see in the logs.
  socket.write_mesg("json", { event: "hello" });

  //  start sending heartbeats over this socket, so project knows it is working.
  initHeartbeat(socket);
}
