import Primus from "primus";
import { join } from "path";
import * as responder from "primus-responder";
import * as multiplex from "@cocalc/primus-multiplex";
import type {
  ProjectWebsocket,
  WebsocketState,
} from "@cocalc/sync/client/types";
import debug from "debug";

export default async function connectionToProject(
  project_id: string
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
  log("connecting to ", url);
  const opts = {
    pathname: join(appBasePath, project_id, "raw/.smc/ws"),
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const primus = Primus.createSocket(opts);
  const socket = new primus(url) as unknown as ProjectWebsocket;

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
    updateState("online");
  });
  socket.on("reconnected", () => {
    updateState("online");
  });

  socket.on("reconnect", () => {
    updateState("offline");
  });
  socket.on("reconnect scheduled", () => {
    updateState("offline");
  });

  socket.on("end", () => {
    // maybe todo?
    updateState("offline");
  });

  return socket;
}
