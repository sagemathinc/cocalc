/*
This is adapted from https://github.com/nteract/enchannel-zmq-backend but with
significant rewriting, bug fixing, etc.

The original and all modifications in CoCalc of the code in THIS DIRECTORY
are: * BSD 3-Clause License *
*/

import { Channels, JupyterMessage } from "@nteract/messaging";
import * as moduleJMP from "./jmp";
import { fromEvent, merge, Observable, Subject, Subscriber } from "rxjs";
import { FromEventTarget } from "rxjs/internal/observable/fromEvent";
import { map, publish, refCount } from "rxjs/operators";
import { v4 as uuid } from "uuid";
import { once } from "@cocalc/util/async-utils";

export const ZMQType = {
  frontend: {
    iopub: "sub",
    stdin: "dealer",
    shell: "dealer",
    control: "dealer",
  },
} as const;

type ChannelName = "iopub" | "stdin" | "shell" | "control";

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

interface HeaderFiller {
  session: string;
  username: string;
}

/**
 * Takes a Jupyter spec connection info object and channel and returns the
 * string for a channel. Abstracts away tcp and ipc connection string
 * formatting
 *
 * @param config  Jupyter connection information
 * @param channel Jupyter channel ("iopub", "shell", "control", "stdin")
 *
 * @returns The connection string
 */
export const formConnectionString = (
  config: JupyterConnectionInfo,
  channel: ChannelName,
) => {
  const portDelimiter = config.transport === "tcp" ? ":" : "-";
  const port = config[`${channel}_port` as keyof JupyterConnectionInfo];
  if (!port) {
    throw new Error(`Port not found for channel "${channel}"`);
  }
  return `${config.transport}://${config.ip}${portDelimiter}${port}`;
};

/**
 * Creates a socket for the given channel with ZMQ channel type given a config
 *
 * @param channel Jupyter channel ("iopub", "shell", "control", "stdin")
 * @param config  Jupyter connection information
 *
 * @returns The new Jupyter ZMQ socket
 */
async function createSocket(
  channel: ChannelName,
  config: JupyterConnectionInfo,
  identity: string,
): Promise<moduleJMP.Socket> {
  const zmqType = ZMQType.frontend[channel];
  const scheme = config.signature_scheme.slice("hmac-".length);
  const socket = new moduleJMP.Socket(zmqType, scheme, config.key, identity);
  //socket["identity"] = identity;
  //socket._socket["routingId"] = identity;
  // @ts-ignore
  console.log(channel, identity, socket._socket.routingId);
  const url = formConnectionString(config, channel);
  const connected = once(socket, "connect");
  socket.monitor();
  socket.connect(url);
  await connected;
  return socket;
}

export const getUsername = () =>
  process.env.LOGNAME ||
  process.env.USER ||
  process.env.LNAME ||
  process.env.USERNAME ||
  "username"; // This is the fallback that the classic notebook uses

/**
 * Creates a multiplexed set of channels.
 *
 * @param  config                  Jupyter connection information
 * @param  config.ip               IP address of the kernel
 * @param  config.transport        Transport, e.g. TCP
 * @param  config.signature_scheme Hashing scheme, e.g. hmac-sha256
 * @param  config.iopub_port       Port for iopub channel
 * @param  subscription            subscribed topic; defaults to all
 *
 * @returns Subject containing multiplexed channels
 */
export const createMainChannel = async (
  config: JupyterConnectionInfo,
  identity: string,
  subscription: string = "",
  header: HeaderFiller = {
    session: uuid(),
    username: getUsername(),
  },
): Promise<Channels> => {
  const sockets = await createSockets(config, subscription, identity);
  allSockets[identity] = sockets;
  const main = createMainChannelFromSockets(sockets, header);
  return main;
};

const allSockets: { [identity: string]: any } = {};

export function closeSockets(identity: string) {
  const x = allSockets[identity];
  if (x != null) {
    for (const name in x) {
      x[name].close();
    }
  }
  delete allSockets[identity];
}

/**
 * Sets up the sockets for each of the jupyter channels.
 *
 * @param config Jupyter connection information
 * @param subscription The topic to filter the subscription to the iopub channel on
 * @param jmp A reference to the JMP Node module
 *
 * @returns Sockets for each Jupyter channel
 */
export const createSockets = async (
  config: JupyterConnectionInfo,
  subscription: string = "",
  identity: string,
) => {
  const [shell, control, stdin, iopub] = await Promise.all([
    createSocket("shell", config, identity),
    createSocket("control", config, identity),
    createSocket("stdin", config, identity),
    createSocket("iopub", config, identity),
  ]);

  // NOTE: ZMQ PUB/SUB subscription (not an Rx subscription)
  iopub.subscribe(subscription);

  stdin.on("message", (mesg) => {
    console.log("got stdin message", mesg);
  });

  return {
    shell,
    control,
    stdin,
    iopub,
  };
};

/**
 * Creates a multiplexed set of channels.
 *
 * @param sockets An object containing associations between channel types and 0MQ sockets
 * @param header The session and username to place in kernel message headers
 * @param jmp A reference to the JMP Node module
 *
 * @returns Creates an Observable for each channel connection that allows us
 * to send and receive messages through the Jupyter protocol.
 */
export const createMainChannelFromSockets = (
  sockets: {
    [name: string]: moduleJMP.Socket;
  },
  header: HeaderFiller = {
    session: uuid(),
    username: getUsername(),
  },
): Channels => {
  // The mega subject that encapsulates all the sockets as one multiplexed
  // stream

  const outgoingMessages = Subscriber.create<JupyterMessage>(
    (message) => {
      // There's always a chance that a bad message is sent, we'll ignore it
      // instead of consuming it
      if (!message || !message.channel) {
        console.warn("message sent without a channel", message);
        return;
      }
      const socket = sockets[message.channel];
      if (!socket) {
        // If, for some reason, a message is sent on a channel we don't have
        // a socket for, warn about it but don't bomb the stream
        console.warn("channel not understood for message", message);
        return;
      }
      try {
        const jMessage = new moduleJMP.Message({
          // Fold in the setup header to ease usage of messages on channels
          header: { ...message.header, ...header },
          parent_header: message.parent_header,
          content: message.content,
          metadata: message.metadata,
          buffers: message.buffers as any,
        });
        socket.send(jMessage);
      } catch (err) {
        console.error("Error sending message", err, message);
      }
    },
    undefined, // not bothering with sending errors on
    () =>
      // When the subject is completed / disposed, close all the event
      // listeners and shutdown the socket
      Object.keys(sockets).forEach((name) => {
        const socket = sockets[name];
        socket.removeAllListeners();
        socket.close?.();
      }),
  );

  // Messages from kernel on the sockets
  const incomingMessages: Observable<JupyterMessage> = merge(
    // Form an Observable with each socket
    ...Object.keys(sockets).map((name) => {
      const socket = sockets[name];
      // fromEvent typings are broken. socket will work as an event target.
      return fromEvent(
        // Pending a refactor around jmp, this allows us to treat the socket
        // as a normal event emitter
        socket as unknown as FromEventTarget<JupyterMessage>,
        "message",
      ).pipe(
        map((body: JupyterMessage): JupyterMessage => {
          // Route the message for the frontend by setting the channel
          const msg = { ...body, channel: name };
          // Conform to same message format as notebook websockets
          // See https://github.com/n-riesco/jmp/issues/10
          delete (msg as any).idents;
          return msg;
        }),
        publish(),
        refCount(),
      );
    }),
  ).pipe(publish(), refCount());

  const subject: Subject<JupyterMessage> = Subject.create(
    outgoingMessages,
    incomingMessages,
  );

  return subject;
};
