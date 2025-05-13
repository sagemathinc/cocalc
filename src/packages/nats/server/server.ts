/*


cd ../server
node

  io = require('@cocalc/server/nats/socketio').initServer()
   
*/

import type { ServerInfo } from "./types";

const MAX_PAYLOAD = 8 * 1e6;

export function init(opts) {
  return new NatsServer(opts);
}

export class NatsServer {
  public readonly io;
  public readonly id: number;

  constructor({
    Server,
    httpServer,
    port = 3000,
    id = 0,
  }: {
    Server;
    httpServer?;
    port?: number;
    id?: number;
  }) {
    this.id = id;
    if (httpServer) {
      this.io = new Server(httpServer, { maxHttpBufferSize: MAX_PAYLOAD });
    } else {
      this.io = new Server({ maxHttpBufferSize: MAX_PAYLOAD });
      this.log(`listening on port ${port}`);
      this.io.listen(port);
    }
    this.init();
  }

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
    };
  };

  private log = (...args) => {
    console.log("conat", this.id, ...args);
  };

  private init = () => {
    const { io } = this;
    io.on("connection", (socket) => {
      this.log("got connection", socket.id);
      socket.emit("info", this.info());

      socket.on("publish", ({ subject, data }) => {
        // TODO: auth check
        this.log("publishing", { subject, data });
        io.to(subject).emit(subject, data);
      });

      socket.on("subscribe", ({ subject }) => {
        // TODO: auth check
        this.log("join ", { subject });
        socket.join(subject);
      });

      socket.on("unsubscribe", ({ subject }) => {
        socket.leave(subject);
      });
    });
  };
}
