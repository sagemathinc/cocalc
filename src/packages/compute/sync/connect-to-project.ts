import Primus from "primus";
import { join } from "path";
import * as responder from "primus-responder";
import * as multiplex from "@cocalc/primus-multiplex";
import type { ProjectWebsocket } from "@cocalc/sync/client/types";

export default async function connectionToProject(
  project_id: string
): Promise<ProjectWebsocket> {
  // temporary for a proof of concept!
  const port = parseInt(process.env.PROJECT_PORT ?? "34491");
  const appBasePath =
    process.env.PROJECT_BASE_PATH ??
    "/10f0e544-313c-4efe-8718-2142ac97ad11/port/5000";
  const server = process.env.PROJECT_SERVER ?? "http://localhost";

  const url = `${server}:${port}`;
  const opts = {
    pathname: join(appBasePath, project_id, "raw/.smc/ws"),
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const primus = Primus.createSocket(opts);
  const socket = new primus(url);

  socket.on("open", () => {
    console.log("Connected to project");
    socket.on("data", (data) => {
      console.log(`Received from server: ${data}`);
    });
  });

  return socket as unknown as ProjectWebsocket;
}
