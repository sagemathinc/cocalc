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
import { EventIterator } from "@cocalc/util/event-iterator";
import type { ServerInfo } from "./types";
import * as msgpack from "@msgpack/msgpack";
import { randomId } from "@cocalc/nats/names";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
// import { once } from "@cocalc/util/async-utils";

const INBOX_PREFIX = "_INBOX.";
const REPLY_HEADER = "CoCalc-Reply";
const DEFAULT_MAX_WAIT = 30000;

enum Protocol {
  MsgPack = 0,
  JsonCodec = 1,
}
const PROTOCOL = Protocol.MsgPack;

interface ClientOptions {
  inboxPrefix?: string;
}

export class Client {
  public conn: ReturnType<typeof connect>;
  private subscriptions: { [subject: string]: number } = {};
  public info: ServerInfo | undefined = undefined;
  private readonly options: ClientOptions;

  constructor(address: string, options: { inboxPrefix?: string } = {}) {
    this.options = options;
    this.conn = connect(address);
    this.conn.on("info", (info) => {
      this.info = info;
    });
  }

  // returns EventEmitter that emits 'message', mesg: Message
  subscription = (
    subject: string,
    { closeWhenOffCalled }: { closeWhenOffCalled?: boolean } = {},
  ) => {
    const cur = this.subscriptions[subject] ?? 0;
    if (cur == 0) {
      this.conn.emit("subscribe", { subject });
      // todo confirmation/security
    }
    const sub = new Subscription({
      client: this,
      subject,
      closeWhenOffCalled,
    });
    sub.once("close", () => {
      this.subscriptions[subject] -= 1;
      if (this.subscriptions[subject] <= 0) {
        this.conn.emit("unsubscribe", { subject });
        delete this.subscriptions[subject];
      }
    });
    this.subscriptions[subject] = cur + 1;
    return sub;
  };

  subscribe = (
    subject: string,
    { maxWait, mesgLimit }: { maxWait?: number; mesgLimit?: number } = {},
  ) => {
    const sub = this.subscription(subject, { closeWhenOffCalled: true });
    // @ts-ignore
    return new EventIterator<Message>(sub, "message", {
      idle: maxWait,
      limit: mesgLimit,
      map: (args) => args[0],
    });
  };

  publish = (
    subject: string,
    mesg,
    { protocol = PROTOCOL, headers }: PublishOptions = {},
  ) => {
    let raw = encode({ protocol, mesg });
    // default to 1MB is safe since it's at least that big.
    const chunkSize = Math.max(1000, (this.info?.max_payload ?? 1e6) - 1000);
    let seq = 0;
    let id = randomId();
    for (let i = 0; i < raw.length; i += chunkSize) {
      const done = i + chunkSize >= raw.length ? 1 : 0;
      const v: any[] = [
        subject,
        id,
        seq,
        done,
        protocol,
        raw.slice(i, i + chunkSize),
      ];
      if (done && headers) {
        v.push(headers);
      }
      this.conn.emit("publish", v);
      seq += 1;
    }
  };

  request = async (
    subject: string,
    mesg: any,
    {
      maxWait = DEFAULT_MAX_WAIT,
      ...options
    }: PublishOptions & { maxWait?: number } = {},
  ): Promise<Message> => {
    const inboxSubject = `${this.options.inboxPrefix ?? INBOX_PREFIX}${randomId()}`;
    const sub = this.subscribe(inboxSubject, { maxWait, mesgLimit: 1 });
    this.publish(subject, mesg, {
      headers: { ...options, [REPLY_HEADER]: inboxSubject },
    });
    for await (const resp of sub) {
      return resp;
    }
    throw Error("timeout");
  };

  watch = async (subject: string, cb = console.log) => {
    for await (const x of this.subscribe(subject)) {
      cb(x);
    }
  };
}

interface PublishOptions {
  protocol?: Protocol;
  headers?: JSONValue;
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

class Subscription extends EventEmitter {
  private incoming: { [id: string]: Partial<Chunk>[] } = {};
  private client: Client;
  private closeWhenOffCalled?: boolean;
  private subject: string;

  constructor({ client, subject, closeWhenOffCalled }) {
    super();
    this.client = client;
    this.subject = subject;
    this.client.conn.on(subject, this.handle);
    this.closeWhenOffCalled = closeWhenOffCalled;
  }

  close = () => {
    this.emit("close");
    this.client.conn.removeListener(this.subject, this.handle);
    // @ts-ignore
    delete this.incoming;
    // @ts-ignore
    delete this.client;
    // @ts-ignore
    delete this.subject;
    // @ts-ignore
    delete this.closeWhenOffCalled;
  };

  off(a, b) {
    super.off(a, b);
    if (this.closeWhenOffCalled) {
      this.close();
    }
    return this;
  }

  private handle = ([id, seq, done, protocol, buffer, headers]) => {
    if (this.client == null) {
      return;
    }
    // console.log({ id, seq, done, protocol, buffer, headers });
    const chunk = { seq, done, protocol, buffer, headers };
    const incoming = this.incoming;
    if (incoming[id] == null) {
      if (seq != 0) {
        // part of a dropped message -- by definition this should just
        // silently happen and be handled via application level protocols
        // elsewhere
        this.emit("drop");
        return;
      }
      incoming[id] = [];
    } else {
      if ((incoming[id].slice(-1)[0].seq ?? -100) + 1 != seq) {
        // part of message was dropped -- discard everything
        delete incoming[id];
        this.emit("drop");
        return;
      }
    }
    incoming[id].push(chunk);
    if (chunk.done) {
      // console.log("assembling ", incoming[id].length, "chunks");
      const chunks = incoming[id].map((x) => x.buffer!);
      const data = Buffer.concat(chunks);
      delete incoming[id];
      const mesg = new Message({
        mesg: decode({ protocol, data }),
        headers,
        client: this.client,
      });
      this.emit("message", mesg);
    }
  };
}

export class Message {
  private client: Client;
  public readonly mesg: any;
  public readonly headers: JSONValue;

  constructor({ mesg, headers, client }) {
    this.mesg = mesg;
    this.headers = headers;
    this.client = client;
  }

  respond = (mesg: any) => {
    const subject = this.headers?.[REPLY_HEADER];
    if (!subject) {
      throw Error("message is not a request");
    }
    this.client.publish(subject, mesg);
  };
}
