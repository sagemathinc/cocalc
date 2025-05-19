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

import getConnection, {
  setConnectionOptions,
} from "@cocalc/backend/conat/persistent-connection";
import { getLogger } from "@cocalc/project/logger";
import { apiKey, natsWebsocketServer } from "@cocalc/backend/data";
import { inboxPrefix as getInboxPrefix } from "@cocalc/conat/names";
import { project_id } from "@cocalc/project/data";
import secretToken from "@cocalc/project/servers/secret-token";
export { connect as connectToConat } from "@cocalc/backend/conat/conat";

export default getConnection;

const logger = getLogger("project:nats:connection");

function getServers() {
  if (process.env.NATS_SERVER) {
    return process.env.NATS_SERVER;
  } else {
    return natsWebsocketServer;
  }
}

setConnectionOptions(async () => {
  logger.debug("setting connection options");
  return {
    inboxPrefix: getInboxPrefix({ project_id }),
    servers: getServers(),
    name: JSON.stringify({ project_id }),
    user: `project-${project_id}`,
    token: apiKey ? apiKey : await secretToken(),
  };
});
