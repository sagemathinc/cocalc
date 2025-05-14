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
const MB = 1e6;
const MAX_PAYLOAD = 1 * MB;

export function init(opts) {
  return new CoNatServer(opts);
}

export class CoNatServer {
  public readonly io;
  public readonly id: number;
  private readonly logger: (...args) => void;
  private queueGroups: { [subject: string]: { [queue: string]: Set<string> } } =
    {};

  constructor({
    Server,
    httpServer,
    port = 3000,
    id = 0,
    logger,
    path,
  }: {
    Server;
    httpServer?;
    port?: number;
    id?: number;
    logger?;
    path?: string;
  }) {
    this.id = id;
    this.logger = logger;
    this.log("Starting CoNat server...", {
      id,
      path,
      port,
      httpServer: httpServer != null,
    });
    const options = {
      maxHttpBufferSize: MAX_PAYLOAD,
      path,
    };
    this.log(options);
    if (httpServer) {
      this.io = new Server(httpServer, options);
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
        const g = this.queueGroups[subject];
        //this.log("publishing", { subject, data, g });
        if (g != null) {
          // send to exactly one in each queue group
          for (const queue in g) {
            const v = Array.from(g[queue]);
            const choice = v[Math.floor(Math.random() * v.length)];
            // console.log({ choice });
            if (choice != null) {
              io.to(choice).emit(subject, data);
            }
          }
        } else {
          io.to(subject).emit(subject, data);
        }
      });

      socket.on("subscribe", ({ subject, queue }) => {
        // TODO: auth check
        // TODO: load balance across each queue group
        this.log("subscribe ", { subject, queue });
        if (queue) {
          const queueSubject = JSON.stringify({ queue: socket.id, subject });
          if (this.queueGroups[subject] == null) {
            this.queueGroups[subject] = { [queue]: new Set([queueSubject]) };
          } else if (this.queueGroups[subject][queue] == null) {
            this.queueGroups[subject][queue] = new Set([queueSubject]);
          } else {
            this.queueGroups[subject][queue].add(queueSubject);
          }
          socket.join(queueSubject);
        } else {
          socket.join(subject);
        }
      });

      socket.on("unsubscribe", ({ subject }) => {
        this.log("unsubscribe ", { subject });
        // TODO: handle queue groups from above
        socket.leave(subject);
      });
    });
  };
}
