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

export type AuthFunction = (socket) => Promise<any>;

export class CoNatServer {
  public readonly io;
  public readonly id: number;
  private readonly logger: (...args) => void;
  private queueGroups: { [subject: string]: { [queue: string]: Set<string> } } =
    {};
  private getUser?: AuthFunction;

  constructor({
    Server,
    httpServer,
    port = 3000,
    id = 0,
    logger,
    path,
    getUser,
  }: {
    Server;
    httpServer?;
    port?: number;
    id?: number;
    logger?;
    path?: string;
    getUser?;
  }) {
    this.getUser = getUser;
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

  private unsubscribe = ({ socket, subject }) => {
    this.log("unsubscribe ", { id: socket.id, subject });
    socket.leave(subject);
    const groups = this.queueGroups[subject];
    if (groups != null) {
      const socketSubject = socketSpecificSubject({ socket, subject });
      for (const queue in groups) {
        groups[queue].delete(socketSubject);
      }
    }
  };

  private subscribe = ({ socket, subject, queue }) => {
    this.log("subscribe ", { id: socket.id, subject, queue });
    if (queue) {
      const socketSubject = socketSpecificSubject({ socket, subject });
      if (this.queueGroups[subject] == null) {
        this.queueGroups[subject] = { [queue]: new Set([socketSubject]) };
      } else if (this.queueGroups[subject][queue] == null) {
        this.queueGroups[subject][queue] = new Set([socketSubject]);
      } else {
        this.queueGroups[subject][queue].add(socketSubject);
      }
      socket.join(socketSubject);
    } else {
      socket.join(subject);
    }
  };

  private publish = ({ socket, subject, data, from }) => {
    // TODO: auth check
    // @ts-ignore
    const _socket = socket; // TODO
    const g = this.queueGroups[subject];
    //this.log("publishing", { subject, data, g });
    if (g != null) {
      let count = 0;
      // send to exactly one in each queue group
      for (const queue in g) {
        const v = Array.from(g[queue]);
        const choice = v[Math.floor(Math.random() * v.length)];
        // console.log({ choice });
        if (choice != null) {
          this.io.to(choice).emit(subject, { data, from });
          count += 1;
        }
      }
      if (count > 0) {
        // at least one queue group
        return;
      }
    }
    // just send to everyone
    this.io.to(subject).emit(subject, { data, from });
  };

  private init = () => {
    this.io.on("connection", this.handleSocket);
  };

  private handleSocket = async (socket) => {
    let user: any = null;
    if (this.getUser) {
      user = await this.getUser?.(socket);
    }
    this.log("got connection", { id: socket.id, user });

    socket.emit("info", { ...this.info(), user });

    socket.on("publish", ([subject, ...data]) => {
      this.publish({ socket, subject, data, from: user });
    });

    socket.on("subscribe", ({ subject, queue }) => {
      this.subscribe({ socket, subject, queue });
    });

    socket.on("unsubscribe", ({ subject }) => {
      this.unsubscribe({ socket, subject });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        const subject = getRoomSubject(room);
        this.unsubscribe({ socket, subject });
      }
    });
  };
}

function getRoomSubject(room: string) {
  if (room.startsWith("{")) {
    return JSON.parse(room).subject;
  } else {
    return room;
  }
}

function socketSpecificSubject({ socket, subject }) {
  return JSON.stringify({ id: socket.id, subject });
}
