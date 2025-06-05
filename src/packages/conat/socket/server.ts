import { ConatSocketBase } from "./base";
import { PING_PONG_INTERVAL, type Command, SOCKET_HEADER_CMD } from "./util";
import { ServerSocket } from "./server-socket";
import { delay } from "awaiting";
import { type Headers } from "@cocalc/conat/core/client";

export class ConatSocketServer extends ConatSocketBase {
  initTCP() {}

  channel(channel: string) {
    return new ConatSocketServer({
      subject: this.subject + "." + channel,
      client: this.client,
      role: this.role,
      id: this.id,
    }) as ConatSocketServer;
  }

  forEach = (f: (socket: ServerSocket, id: string) => void) => {
    for (const id in this.sockets) {
      f(this.sockets[id], id);
    }
  };

  protected async run() {
    this.deleteDeadSockets();
    const sub = await this.client.subscribe(`${this.subject}.server.*`, {
      sticky: true,
      ephemeral: true,
    });
    if (this.state == "closed") {
      sub.close();
      return;
    }
    this.sub = sub;
    this.setState("ready");
    for await (const mesg of this.sub) {
      // console.log("got mesg", mesg.data, mesg.headers);
      if (this.state == ("closed" as any)) {
        return;
      }
      const id = mesg.subject.split(".").slice(-1)[0];
      let socket = this.sockets[id];
      if (socket === undefined) {
        // new connection
        socket = new ServerSocket({
          conatSocket: this,
          id,
          subject: mesg.subject,
        });
        this.sockets[id] = socket;
        this.emit("connection", socket);
      }
      const cmd = mesg.headers?.[SOCKET_HEADER_CMD];
      if (cmd !== undefined) {
        // note: test this first since it is also a request
        // a special internal control command
        this.handleCommandFromClient({ socket, cmd: cmd as Command, mesg });
      } else if (mesg.isRequest()) {
        // a request to support the socket.on('request', (mesg) => ...) protocol:
        socket.emit("request", mesg);
      } else {
        socket.receiveDataFromClient(mesg);
      }
    }
  }

  private async deleteDeadSockets() {
    while (this.state != "closed") {
      for (const id in this.sockets) {
        const socket = this.sockets[id];
        if (Date.now() - socket.lastPing > PING_PONG_INTERVAL * 2.5) {
          socket.destroy();
        }
      }
      await delay(PING_PONG_INTERVAL);
    }
  }

  request = async (data, options?) => {
    await this.waitUntilReady(options?.timeout);

    // we call all connected sockets in parallel,
    // then return array of responses.
    // Unless race is set, then we return first result
    const v: any[] = [];
    for (const id in this.sockets) {
      const f = async () => {
        if (this.state == "closed") {
          throw Error("closed");
        }
        try {
          return await this.sockets[id].request(data, options);
        } catch (err) {
          return err;
        }
      };
      v.push(f());
    }
    if (options?.race) {
      return await Promise.race(v);
    } else {
      return await Promise.all(v);
    }
  };

  write = (data, { headers }: { headers?: Headers } = {}): void => {
    // @ts-ignore
    if (this.state == "closed") {
      throw Error("closed");
    }
    // write to all the sockets that are connected.
    for (const id in this.sockets) {
      this.sockets[id].write(data, headers);
    }
  };

  handleCommandFromClient = ({
    socket,
    cmd,
    mesg,
  }: {
    socket: ServerSocket;
    cmd: Command;
    mesg;
  }) => {
    socket.lastPing = Date.now();
    if (cmd == "socket") {
      socket.tcp.send.handleRequest(mesg);
    } else if (cmd == "ping") {
      mesg.respondSync("pong");
    } else if (cmd == "close") {
      const id = socket.id;
      socket.close();
      delete this.sockets[id];
      mesg.respondSync("closed");
    } else if (cmd == "connect") {
      mesg.respondSync("connected");
    } else {
      mesg.respondSync({ error: `unknown command - '${cmd}'` });
    }
  };

  async end({ timeout = 3000 }: { timeout?: number } = {}) {
    if (this.state == "closed") {
      return;
    }
    this.reconnection = false;
    this.ended = true;
    // tell all clients to end
    const end = async (id) => {
      const socket = this.sockets[id];
      delete this.sockets[id];
      try {
        await socket.end({ timeout });
      } catch (err) {
        console.log("WARNING: error ending socket -- ${err}");
      }
    };
    await Promise.all(Object.keys(this.sockets).map(end));
    this.close();
  }
}
