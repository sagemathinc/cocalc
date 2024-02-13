import Primus from "primus";
import { join } from "path";
import * as responder from "@cocalc/primus-responder";
import * as multiplex from "@cocalc/primus-multiplex";
import type {
  ProjectWebsocket,
  WebsocketState,
} from "@cocalc/sync/client/types";
import { apiKey, apiServer } from "@cocalc/backend/data";
import versionCookie from "./version-cookie";
import { toCookieHeader } from "./cookies";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import basePath from "@cocalc/backend/base-path";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("sync-client:connect");
const log = logger.debug;

export default async function connectToProject(
  project_id,
): Promise<ProjectWebsocket> {
  if (!apiServer) {
    throw Error("API_SERVER must be set");
  }
  if (!apiKey) {
    throw Error("api key must be set (e.g., set API_KEY env variable)");
  }
  const server = apiServer;
  const pathname = join(basePath, project_id, "raw/.smc/ws");
  const target = join(server, project_id, "raw/.smc/ws");
  log("connectToProject -- ", { pathname, target });
  const opts = {
    pathname,
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const Socket = Primus.createSocket(opts);
  log("API_COOKIE_NAME = ", API_COOKIE_NAME);
  const Cookie = toCookieHeader({
    ...versionCookie(),
    [API_COOKIE_NAME]: apiKey,
  });
  const socket: ProjectWebsocket = new Socket(server, {
    transport: {
      // rejectUnauthorized is useful for testing and connecting to a cocalc-docker; it allows connecting to
      // server with self-signed cert; obviously a slight risk to allow this.
      rejectUnauthorized: false,
      headers: { Cookie },
    },
    // even with this, it seems to take far too long to connect to
    // a project, e.g., as compared to the frontend browser.
    // I think there is maybe an issue in the proxy server.
    reconnect: {
      factor: 1.3,
      min: 750,
      max: 10000,
      retries: 10000,
    },
  }) as any;

  // Every single individual channel creates listeners
  // on this socket, and we create several channels per
  // document, so we expect a relatively large number
  // of listeners on this socket.  This is OK, because
  // it is rare for events to fire (e.g., it happens when
  // the network is down or project restarts).
  socket.setMaxListeners(500);

  function updateState(state: WebsocketState) {
    if (socket.state == state) {
      return; // nothing changed, so no need to set or emit.
    }
    log("state changed to ", state);
    socket.state = state;
    socket.emit("state", state);
  }

  updateState("offline"); // starts offline

  socket.on("open", () => {
    log("open", target);
    updateState("online");
  });
  socket.on("reconnected", () => {
    log("reconnected", target);
    updateState("online");
  });

  socket.on("reconnect", () => {
    log("reconnect", target);
    updateState("offline");
  });
  socket.on("reconnect scheduled", () => {
    log("reconnect scheduled", target);
    updateState("offline");
  });

  socket.on("end", () => {
    log("end", target);
    // maybe todo?
    updateState("offline");
  });

  return socket;
}
