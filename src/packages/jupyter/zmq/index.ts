import { EventEmitter } from "events";
import { Dealer, Subscriber } from "zeromq";
import { Message } from "./message";
import type { JupyterMessage } from "./types";

//import { getLogger } from "@cocalc/backend/logger";
//const logger = getLogger("jupyter:zmq");

type JupyterSocketName = "iopub" | "shell" | "stdin" | "control";

export const ZMQ_TYPE = {
  iopub: "sub",
  stdin: "dealer",
  shell: "dealer",
  control: "dealer",
} as const;

export interface JupyterConnectionInfo {
  version: number;
  iopub_port: number;
  shell_port: number;
  stdin_port: number;
  control_port: number;
  signature_scheme: "hmac-sha256";
  hb_port: number;
  ip: string;
  key: string;
  transport: "tcp" | "ipc";
}

export async function jupyterSockets(
  config: JupyterConnectionInfo,
  identity: string,
) {
  const sockets = new JupyterSockets(config, identity);
  await sockets.init();
  return sockets;
}

export class JupyterSockets extends EventEmitter {
  private sockets?: {
    iopub: Subscriber;
    stdin: Dealer;
    shell: Dealer;
    control: Dealer;
  };

  constructor(
    private config: JupyterConnectionInfo,
    private identity: string,
  ) {
    super();
  }

  close = () => {
    if (this.sockets != null) {
      for (const name in this.sockets) {
        // close doesn't work and shouldn't be used according to the
        // zmq docs: https://zeromq.github.io/zeromq.js/classes/Dealer.html#close
        delete this.sockets[name];
      }
      delete this.sockets;
    }
  };

  send = (message: JupyterMessage) => {
    if (this.sockets == null) {
      throw Error("JupyterSockets not initialized");
    }
    const name = message.channel;
    if (name == "iopub") {
      throw Error("name must not be iopub");
    }
    const socket = this.sockets[name];
    if (socket == null) {
      throw Error(`invalid socket name '${name}'`);
    }

    //logger.debug("send message", message);
    const jMessage = new Message(message);
    socket.send(
      jMessage._encode(
        this.config.signature_scheme.slice("hmac-".length),
        this.config.key,
      ),
    );
  };

  init = async () => {
    const names = Object.keys(ZMQ_TYPE);
    const v = await Promise.all(
      names.map((name: JupyterSocketName) => this.createSocket(name)),
    );
    const sockets: any = {};
    let i = 0;
    for (const name of names) {
      sockets[name] = v[i];
      i += 1;
    }
    this.sockets = sockets;
  };

  private createSocket = async (name: JupyterSocketName) => {
    const zmqType = ZMQ_TYPE[name];
    let socket;
    if (zmqType == "dealer") {
      socket = new Dealer({ routingId: this.identity });
    } else if (zmqType == "sub") {
      socket = new Subscriber();
    } else {
      throw Error(`bug -- invalid zmqType ${zmqType}`);
    }
    const url = connectionString(this.config, name);
    await socket.connect(url);
    // console.log("connected to", url);
    this.listen(name, socket);
    return socket;
  };

  private listen = async (name: JupyterSocketName, socket) => {
    if (ZMQ_TYPE[name] == "sub") {
      // subscribe to everything --
      //   https://zeromq.github.io/zeromq.js/classes/Subscriber.html#subscribe
      socket.subscribe();
    }
    for await (const data of socket) {
      const mesg = Message._decode(
        data,
        this.config.signature_scheme.slice("hmac-".length),
        this.config.key,
      );
      this.emit(name, mesg);
    }
  };
}

export const connectionString = (
  config: JupyterConnectionInfo,
  name: JupyterSocketName,
) => {
  const portDelimiter = config.transport === "tcp" ? ":" : "-";
  const port = config[`${name}_port` as keyof JupyterConnectionInfo];
  if (!port) {
    throw new Error(`Port not found for name "${name}"`);
  }
  return `${config.transport}://${config.ip}${portDelimiter}${port}`;
};
