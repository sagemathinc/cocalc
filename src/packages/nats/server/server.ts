/*


cd ../server
node

  io = require('@cocalc/server/nats/socketio').initServer()
   
*/

import type { ServerInfo } from "./types";

// This is just the default with socket.io, but we might want a bigger
// size, which could mean more RAM usage by the servers.
// Our client protocol automatically chunks messages, so this payload
// size ONLY impacts performance, never application level constraints.
const MAX_PAYLOAD = 1e6; // 1MB

export function init(opts) {
  return new NatsServer(opts);
}

export class NatsServer {
  public readonly io;
  public readonly id: number;
  private readonly logger: (...args) => void;

  constructor({
    Server,
    httpServer,
    port = 3000,
    id = 0,
    logger,
  }: {
    Server;
    httpServer?;
    port?: number;
    id?: number;
    logger?;
  }) {
    this.id = id;
    this.logger = logger;
    this.log("Starting CoNat server with id", { id });
    const options = {
      maxHttpBufferSize: MAX_PAYLOAD,
    };
    this.log(options);
    if (httpServer) {
      this.io = new Server(httpServer);
    } else {
      this.io = new Server(port, options);
      this.log(`listening on port ${port}`);
    }
    this.init();
  }

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
    };
  };

  private log = (...args) => {
    this.logger?.(new Date().toISOString(), "conat", this.id, ":", ...args);
  };

  private init = () => {
    const { io } = this;
    io.on("connection", (socket) => {
      this.log("got connection", socket.id);
      socket.emit("info", this.info());

      socket.on("publish", ([subject, ...data]) => {
        // TODO: auth check
        // this.log("publishing", { subject, data });
        io.to(subject).emit(subject, data);
      });

      socket.on("subscribe", ({ subject }) => {
        // TODO: auth check
        this.log("subscribe ", { subject });
        socket.join(subject);
      });

      socket.on("unsubscribe", ({ subject }) => {
        this.log("unsubscribe ", { subject });
        socket.leave(subject);
      });
    });
  };
}
