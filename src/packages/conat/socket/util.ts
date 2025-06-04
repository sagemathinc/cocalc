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
export const PING_PONG_INTERVAL = 60000;

// We queue up unsent writes, but only up to a point (to not have a huge memory issue).
// Any write beyond the last this many are discarded:
export const DEFAULT_MAX_QUEUE_SIZE = 100;

export const DEFAULT_TIMEOUT = 7500;

export type Command = "connect" | "close" | "ping" | "socket";

import { type Client } from "@cocalc/conat/core/client";

export interface ConatSocketOptions {
  subject: string;
  client: Client;
  role: Role;
  id: string;
  maxQueueSize?: number;
  // (Default: true) Whether reconnection is enabled or not.
  // If set to false, you need to manually reconnect:
  reconnection?: boolean;
}


