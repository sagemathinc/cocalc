/*
Create a nats connection that doesn't break.

The NATS docs

https://github.com/nats-io/nats.js/blob/main/core/README.md#connecting-to-a-nats-server

ensure us that "the client will always attempt to reconnect if the connection is
disrupted for a reason other than calling close()" but THAT IS NOT TRUE.
(I think the upstream code in disconnected in nats.js/core/src/protocol.ts is a lazy
and I disagree with it.  It tries to connect but if anything goes slightly wrong,
just gives up forever.)

There are definitely situations where the connection gets permanently closed
and the close() function was not called, at least not by any of our code.
I've given up on getting them to fix or understand their bugs in general:

https://github.com/williamstein/nats-bugs/issues/8

We thus monitor the connection, and if it closed, we *swap out the protocol
object*, which is an evil hack to reconnect. This seems to work fine with all
our other code.

All that said, it's excellent that the NATS library separates the protocol from
the connection object itself, so it's possible to do this at all! :-)
*/

import { getLogger } from "@cocalc/backend/logger";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { NatsConnection } from "@cocalc/nats/types";
import { connect as connectViaTCP } from "nats";
import { connect as connectViaWebsocket } from "nats.ws";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { WebSocket } from "ws";

const MONITOR_INTERVAL = 3000;

const logger = getLogger("backend:nats:connection");

let options: any = null;
let getOptions: (() => Promise<any>) | null = null;
export function setConnectionOptions(_getOptions: () => Promise<any>) {
  getOptions = _getOptions;
}

let nc: NatsConnection | null = null;

// gets the singleton connection
const getConnection = reuseInFlight(async (): Promise<NatsConnection> => {
  if (nc == null) {
    logger.debug("initializing nats cocalc backend connection");
    nc = await getNewConnection();
    monitorConnection(nc);
  }
  return nc;
});

export default getConnection;

// NOTE: this monitorConnection also has to work properly with the
// waitUntilConnected function from @cocalc/nats/util.

// The NATS docs ensure us that "the client will always attempt to
// reconnect if the connection is disrupted for a reason other than
// calling close()" but THAT IS NOT TRUE. There are many situations
// where the connection gets permanently closed and close was not
// called, at least not by any of our code.  We thus monitor the
// connection, and if it closed, we *swap out the protocol object*, which
// is an evil hack to reconnect.  This seems to work fine with all our
// other code.
async function monitorConnection(nc) {
  while (true) {
    if (nc.isClosed()) {
      console.log("fixing the NATS connection...");
      const nc2 = await getNewConnection();
      // @ts-ignore
      nc.protocol = nc2.protocol;
      if (!nc.isClosed()) {
        console.log("successfully fixed the NATS connection!");
      } else {
        console.log("failed to fix the NATS connection!");
      }
    }
    await delay(MONITOR_INTERVAL);
  }
}

function getServer(servers) {
  return typeof servers == "string" ? servers : servers[0];
}

export async function getNewConnection(): Promise<NatsConnection> {
  logger.debug("create new connection");
  // make initial delay short, because secret token is being written to database
  // right when project starts, so second attempt very likely to work.
  let d = 1000;
  while (true) {
    try {
      if (options == null && getOptions != null) {
        options = { ...CONNECT_OPTIONS, ...(await getOptions()) };
      }
      if (options == null) {
        throw Error("options not set yet...");
      }
      let connect;
      if (getServer(options.servers).startsWith("ws")) {
        // this is a workaround for a bug involving reconnect that I saw on some forum
        // @ts-ignore
        global.WebSocket = WebSocket;
        connect = connectViaWebsocket;
      } else {
        connect = connectViaTCP;
      }
      logger.debug(`connecting to ${options.servers}`);
      const conn = await connect({ ...options });
      if (conn == null) {
        throw Error("connection failed");
      }
      logger.debug(`connected to ${conn.getServer()}`);
      return conn;
    } catch (err) {
      d = Math.min(15000, d * 1.35) + Math.random() / 2;
      logger.debug(
        `ERROR connecting to ${JSON.stringify(options?.servers)}; will retry in ${d / 1000} seconds.  err=${err}`,
      );
      await delay(d);
    }
  }
}

