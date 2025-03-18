/*
Create a unique connection to the nats server.  The CONNECT_OPTIONS are such that
the connection should never end up in the closed state.

If the environment variable NATS_SERVER is set, this tries to connect to that server.
The server should be of this form for a Websocket server

    ws://hostname:port/path/to/nats

or this for a TCP server: ip-address:port.
That said, for projects and compute servers, **always use a WebSocket**,
since the connection goes through node-http-proxy, so we have more control (e.g.,
can kill it), and we also don't have to expose NATS directly to any untrusted
servers.
*/

import { getLogger } from "@cocalc/project/logger";
import { connect as connectViaTCP } from "nats";
import { natsPorts, natsServer } from "@cocalc/backend/data";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { inboxPrefix as getInboxPrefix } from "@cocalc/nats/names";
import { project_id } from "@cocalc/project/data";
import { delay } from "awaiting";
import secretToken from "@cocalc/project/servers/secret-token";
import { connect as connectViaWebsocket } from "nats.ws";
import { WebSocket } from "ws";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const logger = getLogger("project:nats:connection");

function getServers() {
  if (process.env.NATS_SERVER) {
    return process.env.NATS_SERVER;
  } else {
    return `${natsServer}:${natsPorts.server}`;
  }
}

let nc: Awaited<ReturnType<typeof connectViaTCP>> | null = null;

export const getConnection = reuseInFlight(async () => {
  if (nc != null) {
    return nc;
  }
  logger.debug("initializing nats cocalc project connection");
  const inboxPrefix = getInboxPrefix({ project_id });
  logger.debug("Using ", { inboxPrefix });
  // make initial delay short, because secret token is being written to database
  // right when project starts, so second attempt very likely to work.
  let d = 250;
  const servers = getServers();
  let connect;
  if (servers.startsWith("ws")) {
    global.WebSocket = WebSocket;
    connect = connectViaWebsocket;
  } else {
    connect = connectViaTCP;
  }
  while (nc == null) {
    try {
      logger.debug(`connecting to ${servers}`);
      nc = await connect({
        ...CONNECT_OPTIONS,
        inboxPrefix,
        servers,
        name: JSON.stringify({ project_id }),
        user: `project-${project_id}`,
        token: process.env.API_KEY ? process.env.API_KEY : await secretToken(),
      });
      if (nc == null) {
        throw Error("connection failed");
      }
      logger.debug(`connected to ${nc.getServer()}`);
    } catch (err) {
      d = Math.min(15000, d * 1.35) + Math.random() / 2;
      logger.debug(
        `ERROR connecting to ${JSON.stringify(servers)}; will retry in ${d / 1000} seconds.  err=${err}`,
      );
      await delay(d);
    }
  }
  return nc!;
});

export default getConnection;
