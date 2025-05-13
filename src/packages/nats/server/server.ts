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
  private io;

  constructor({ Server, port = 3000 }) {
    this.io = new Server({ maxHttpBufferSize: MAX_PAYLOAD });
    this.init();
    // [ ] TODO: integrate with hub http server
    this.io.listen(port);
  }

  private info = (): ServerInfo => {
    return {
      max_payload: MAX_PAYLOAD,
    };
  };

  private init = () => {
    const { io } = this;
    io.on("connection", (socket) => {
      console.log("got connection", socket.id);
      socket.emit("info", this.info());

      socket.on("publish", ({ subject, data }) => {
        // TODO: auth check
        console.log("publishing", { subject, data });
        io.to(subject).emit(subject, data);
      });

      socket.on("subscribe", ({ subject }) => {
        // TODO: auth check
        console.log("join ", { subject });
        socket.join(subject);
      });

      socket.on("unsubscribe", ({ subject }) => {
        socket.leave(subject);
      });
    });
  };
}
