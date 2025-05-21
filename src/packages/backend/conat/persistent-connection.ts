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

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { NatsConnection } from "@cocalc/conat/types";

export function setConnectionOptions(_: any) {}

// gets the singleton connection
const getConnection = reuseInFlight(async (): Promise<NatsConnection> => {
  return null as any;
});

export default getConnection;

export async function getNewConnection(): Promise<NatsConnection> {
  return null as any;
}
