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

export default async function connectToProject(
  project_id
): Promise<ProjectWebsocket> {
  const log = debug("cocalc:compute:sync:connect");

  // temporary for a proof of concept!
  if (!process.env.PROJECT_PORT) {
    throw Error("you MUST set the env variable PROJECT_PORT right now");
  }
  const port = parseInt(process.env.PROJECT_PORT);
  const appBasePath =
    process.env.PROJECT_BASE_PATH ??
    "/10f0e544-313c-4efe-8718-2142ac97ad11/port/5000";
  const server = process.env.PROJECT_SERVER ?? "http://localhost";

  const url = `${server}:${port}`;
  const pathname = join(appBasePath, project_id, "raw/.smc/ws");
  const target = `${url}${pathname}`;
  log("connecting to ", target);
  const opts = {
    pathname,
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const Socket = Primus.createSocket(opts);
  const Cookie = toCookieHeader({ ...versionCookie(), api_key: apiKey });
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
