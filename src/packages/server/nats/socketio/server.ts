import { init as createConatServer } from "@cocalc/nats/server/server";
import { Server } from "socket.io";

export function init({ port, httpServer }: { port?: number; httpServer? }={}) {
  createConatServer({ port, httpServer, Server });
}
