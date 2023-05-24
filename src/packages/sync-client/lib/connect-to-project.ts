import Primus from "primus";
import { join } from "path";
import * as responder from "primus-responder";
import * as multiplex from "@cocalc/primus-multiplex";
import type {
  ProjectWebsocket,
  WebsocketState,
} from "@cocalc/sync/client/types";
import debug from "debug";
import { apiKey } from "@cocalc/backend/data";
import versionCookie from "./version-cookie";
import { toCookieHeader } from "./cookies";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";

export default async function connectToProject(
  project_id
): Promise<ProjectWebsocket> {
  const log = debug("cocalc:compute:sync:connect");

  // temporary for a proof of concept!
  const port = parseInt(process.env.PROJECT_PORT ?? "0");
  const appBasePath = process.env.PROJECT_BASE_PATH ?? "/";
  const server = process.env.PROJECT_SERVER ?? "http://localhost";

  const url = `${server}${port ? `:${port}` : ""}`;
  const pathname = join(appBasePath, project_id, "raw/.smc/ws");
  const target = `${url}${pathname}`;
  log("connecting to ", target);
  const opts = {
    pathname,
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const Socket = Primus.createSocket(opts);
  const Cookie = toCookieHeader({
    ...versionCookie(),
    [API_COOKIE_NAME]: apiKey,
  });
  const socket: ProjectWebsocket = new Socket(url, {
    transport: {
      headers: { Cookie },
    },
  }) as any;

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
