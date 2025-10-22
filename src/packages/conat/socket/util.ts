export const SOCKET_HEADER_CMD = "CN-SocketCmd";
export const SOCKET_HEADER_SEQ = "CN-SocketSeq";

export type State = "disconnected" | "connecting" | "ready" | "closed";

export type Role = "client" | "server";

// client pings server this frequently and disconnects if
// doesn't get a pong back.  Server disconnects client if
// it doesn't get a ping as well.  This is NOT the primary
// keep alive/disconnect mechanism -- it's just a backup.
// Primarily we watch the connect/disconnect events from
// socketio and use those to manage things.  This ping
// is entirely a "just in case" backup if some event
// were missed (e.g., a kill -9'd process...)
export const PING_PONG_INTERVAL = 45000;

// We queue up unsent writes, but only up to a point (to not have a huge memory issue).
// Any write beyond this size result in an exception.
// NOTE: in nodejs the default for exactly this is "infinite=use up all RAM", so
// maybe we should make this even larger (?).
// Also note that this is just the *number* of messages, and a message can have
// any size.
export const DEFAULT_MAX_QUEUE_SIZE = 1000;

export let DEFAULT_COMMAND_TIMEOUT = 10_000;
export let DEFAULT_KEEP_ALIVE = 25_000;
export let DEFAULT_KEEP_ALIVE_TIMEOUT = 10_000;

export function setDefaultSocketTimeouts({
  command = DEFAULT_COMMAND_TIMEOUT,
  keepAlive = DEFAULT_KEEP_ALIVE,
  keepAliveTimeout = DEFAULT_KEEP_ALIVE_TIMEOUT,
}: {
  command?: number;
  keepAlive?: number;
  keepAliveTimeout?: number;
}) {
  DEFAULT_COMMAND_TIMEOUT = command;
  DEFAULT_KEEP_ALIVE = keepAlive;
  DEFAULT_KEEP_ALIVE_TIMEOUT = keepAliveTimeout;
}

export type Command = "connect" | "close" | "ping" | "socket";

import { type Client } from "@cocalc/conat/core/client";

export interface SocketConfiguration {
  maxQueueSize?: number;
  // (Default: true) Whether reconnection is enabled or not.
  // If set to false, you need to manually reconnect:
  reconnection?: boolean;
  // ping other end of the socket if no data is received for keepAlive ms;
  // if other side doesn't respond within keepAliveTimeout, then the
  // connection switches to the 'disconnected' state.
  keepAlive?: number; // default: DEFAULT_KEEP_ALIVE
  keepAliveTimeout?: number; // default: DEFAULT_KEEP_ALIVE_TIMEOUT}
  // desc = optional, purely for admin/user
  desc?: string;
  // for a socket client, you can specificy a custom load balancer,
  // instead of just selecting a random socket server (in case of multiple
  // socket servers with the same subject). This is used
  // by the persist server.
  loadBalancer?: (subject: string) => Promise<string>;
}

export interface ConatSocketOptions extends SocketConfiguration {
  subject: string;
  client: Client;
  role: Role;
  id: string;
}

export const RECONNECT_DELAY = 500;

// here subject = `${this.subject}.server.${this.serverId}.${this.id}` is what
// comes from the client to start the session, and this function returns
// `${this.subject}.client.${this.id}`
// which is what the client is listening on
export function clientSubject(subject: string) {
  const segments = subject.split(".");
  const clientId = segments[segments.length - 1];
  return segments.slice(0, -3).join(".") + ".client." + clientId;
}

export function serverStatusSubject(subject) {
  return `${subject}.server.status`;
}
