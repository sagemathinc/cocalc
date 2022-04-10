/* Create the TCP server that communicates with hubs */

import { createServer } from "net";
import { writeFile } from "fs";
import { callback } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/project/logger";
import { hubPortFile } from "@cocalc/project/data";
const { enable_mesg, unlock_socket } = require("@cocalc/backend/misc_node");
import { options } from "@cocalc/project/init-program";
import { secretToken } from "@cocalc/project/servers/secret-token";
const client = require("@cocalc/project/client");
import * as uuid from "uuid";
import handleMessage from "./handle-message";

const winston = getLogger("hub-tcp-server");

export default async function init(): Promise<void> {
  if (!secretToken || secretToken.length < 16) {
    // being extra careful since security
    throw Error("secret token must be defined and at least 16 characters");
    return;
  }

  winston.info("starting tcp server: project <--> hub...");
  const server = createServer(handleConnection);
  server.listen(options.hubPort, options.hostname);
  await once(server, "listening");
  const address = server.address();
  if (address == null || typeof address == "string") {
    // null = failed; string doesn't happen since that's for unix domain
    // sockets, which we aren't using.
    // This is probably impossible, but it makes typescript happier.
    throw Error("failed to assign a port");
  }
  const { port } = address;
  winston.info(`hub tcp_server listening ${options.hostname}:${port}`);
  await callback(writeFile, hubPortFile, `${port}`);
}

async function handleConnection(socket) {
  winston.info(`*new* connection from ${socket.remoteAddress}`);
  socket.on("error", (err) => {
    winston.error(`socket '${socket.remoteAddress}' error - ${err}`);
  });
  socket.on("close", () => {
    winston.info(`*closed* connection from ${socket.remoteAddress}`);
  });

  try {
    await callback(unlock_socket, socket, secretToken);
  } catch (err) {
    winston.error(
      "failed to unlock socket -- ignoring any future messages and closing connection"
    );
    socket.destroy("invalid secret token");
    return;
  }

  socket.id = uuid.v4();
  socket.heartbeat = new Date(); // obviously working now
  enable_mesg(socket);

  socket.on("mesg", (type, mesg) => {
    client.client?.active_socket(socket); // record that this socket is active now.
    if (type === "json") {
      // non-JSON types are handled elsewhere, e.g., for sending binary data.
      // I'm not sure that any other message types are actually used though.
      // winston.debug("received json mesg", mesg);
      handleMessage(socket, mesg);
    }
  });
}
