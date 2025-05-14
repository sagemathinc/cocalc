/*

This is a client that has a similar API to NATS / Socket.io, but is much,
much better in so many ways:

- It has global pub/sub just like with NATS. This uses the server to
  rebroadcast messages, and for authentication. 
    Better than NATS: Authentication is done for a subject *as 
    needed* instead of at connection time.

- Message can be arbitrarily large and they are *automatically* divided
  into chunks and reassembled.   Better than both NATS and socket.io.
  
- There are multiple supported protocols for encoding messages, and
  no coordination is required with the server or other clients!  E.g.,
  one message can be sent with one protocol and the next with a different
  protocol and that's fine.  Better than NATS.
     - MsgPack: https://msgpack.org/ -- a very compact encoding that handles
       dates nicely and small numbers efficiently.  This also works 
       well with binary Buffer objects, which is nice.
     - JsonCodec: uses JSON.stringify and TextEncoder.  This does not work
       with Buffer or Date and is less compact, but can be very fast.


NOTE: There is a socketio msgpack parser, but it just doesn't
work at all, which is weird.  Also, I think it's impossible to
do the sort of chunking we want at the level of a socket.io
parser -- it's just not possible in that the protocol.  We customize
things purely client side without using a parser, and get a much
simpler and better result, inspired by how NATS approaches things
with opaque messages.

USAGE:


c = require("@cocalc/nats/server/client").client();

c.watch('a')

s=await c.subscribe('a');  for await (const x of s) { console.log(x.length)}

// in another console

c = require("@cocalc/nats/server/client").client();
c.publish('a', 'hello there')

*/

import { connect } from "socket.io-client";
import { EventIterator } from "event-iterator";
import type { ServerInfo } from "./types";
import * as msgpack from "@msgpack/msgpack";
import { randomId } from "@cocalc/nats/names";

enum Protocol {
  MsgPack = 0,
  JsonCodec = 1,
}
const PROTOCOL = Protocol.MsgPack;

export class Client {
  private conn: ReturnType<typeof connect>;
  private subscriptions: { [subject: string]: number } = {};
  public info: ServerInfo | undefined = undefined;

  constructor(address: string) {
    this.conn = connect(address);
    this.conn.on("info", (info) => {
      this.info = info;
    });
  }

  subscribe = async (subject: string): Promise<Subscription<any>> => {
    const cur = this.subscriptions[subject] ?? 0;
    if (cur == 0) {
      this.conn.emit("subscribe", { subject });
      // todo confirmation/security
    }
    this.subscriptions[subject] = cur + 1;
    const iter = new EventIterator(({ push }) => {
      this.conn.on(subject, push);
      return () => {
        this.conn.off(subject, push);
        this.subscriptions[subject] -= 1;
        if (this.subscriptions[subject] <= 0) {
          this.conn.emit("unsubscribe", { subject });
        }
      };
    });
    const f = async function* () {
      const incoming: { [id: string]: Partial<Chunk>[] } = {};
      for await (const [
        id,
        seq,
        done,
        protocol,
        buffer,
        headers,
      ] of iter as any) {
        // console.log({ id, seq, done, protocol, buffer, headers });
        const chunk = { seq, done, protocol, buffer, headers };
        if (incoming[id] == null) {
          if (seq != 0) {
            // part of a dropped message -- by definition this should just
            // silently happen and be handled via application level protocols
            // elsewhere
            continue;
          }
          incoming[id] = [];
        } else {
          if ((incoming[id].slice(-1)[0].seq ?? -100) + 1 != seq) {
            // part of message was dropped -- discard everything
            delete incoming[id];
            continue;
          }
        }
        incoming[id].push(chunk);
        if (chunk.done) {
          // console.log("assembling ", incoming[id].length, "chunks");
          const chunks = incoming[id].map((x) => x.buffer!);
          const data = Buffer.concat(chunks);
          delete incoming[id];
          yield { mesg: decode({ protocol, data }), headers };
        }
      }
    };
    return new Subscription(f());
  };

  publish = (
    subject: string,
    mesg,
    { protocol = PROTOCOL, headers }: { protocol?: Protocol; headers? } = {},
  ) => {
    let raw = encode({ protocol, mesg });
    // default to 1MB is safe since it's at least that big.
    const chunkSize = Math.max(1000, (this.info?.max_payload ?? 1e6) - 1000);
    let seq = 0;
    let id = randomId();
    for (let i = 0; i < raw.length; i += chunkSize) {
      const done = i + chunkSize >= raw.length ? 1 : 0;
      const v = [subject, id, seq, done, protocol, raw.slice(i, i + chunkSize)];
      if (done && headers) {
        v.push(headers);
      }
      this.conn.emit("publish", v);
      seq += 1;
    }
  };

  watch = async (subject: string, cb = console.log) => {
    for await (const x of await this.subscribe(subject)) {
      cb(x);
    }
  };
}

function encode({ protocol, mesg }: { protocol: Protocol; mesg: any }) {
  if (protocol == Protocol.MsgPack) {
    return msgpack.encode(mesg);
  } else if (protocol == Protocol.JsonCodec) {
    return jsonEncoder(mesg);
  } else {
    throw Error(`unknown protocol ${protocol}`);
  }
}

function decode({ protocol, data }: { protocol: Protocol; data }): any {
  if (protocol == Protocol.MsgPack) {
    return msgpack.decode(data);
  } else if (protocol == Protocol.JsonCodec) {
    return jsonDecoder(data);
  } else {
    throw Error(`unknown protocol ${protocol}`);
  }
}

let textEncoder: TextEncoder | undefined = undefined;
let textDecoder: TextDecoder | undefined = undefined;

function jsonEncoder(obj: any) {
  if (textEncoder === undefined) {
    textEncoder = new TextEncoder();
  }
  return textEncoder.encode(JSON.stringify(obj));
}

function jsonDecoder(data: Buffer): any {
  if (textDecoder === undefined) {
    textDecoder = new TextDecoder();
  }
  return JSON.parse(textDecoder.decode(data));
}

interface Chunk {
  id: string;
  seq: number;
  done: number;
  buffer: Buffer;
  headers?: any;
}

export function client(address: string = "http://localhost:3000") {
  return new Client(address);
}

class Subscription<T> implements AsyncIterableIterator<T> {
  private iter: AsyncIterableIterator<T>;
  private stopped = false;

  constructor(iter: AsyncIterableIterator<T>) {
    this.iter = iter;
  }

  async next(...args: [] | [any]) {
    if (this.stopped) {
      return { done: true as true, value: undefined };
    }
    const result = await this.iter.next(...args);
    // Don't yield further values after stopped:
    if (this.stopped) {
      return { done: true as true, value: undefined };
    }
    return result;
  }

  async return(value?: any) {
    this.stopped = true;
    return this.iter.return ? this.iter.return(value) : { done: true, value };
  }

  async throw(e?: any) {
    this.stopped = true;
    return this.iter.throw ? this.iter.throw(e) : Promise.reject(e);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.return();
    }
  }
}
