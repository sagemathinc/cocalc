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

For developing at the command line, cd to packages/backend, then in node:

   c = require('@cocalc/backend/nats/conat').connect()
   
or

   c = require('@cocalc/nats/server/client').connect('http://localhost:3000')

   c.watch('a')

   s = await c.subscribe('a');  for await (const x of s) { console.log(x.length)}
   
// in another console

   c = require('@cocalc/backend/nats/conat').connect()
   c.publish('a', 'hello there')

// in browser (right now)

   cc.nats.conat()
   
// client server:

   s = await c.subscribe('eval'); for await(const x of s) { x.respond(eval(x.data)) }

then in another console

   f = async () => (await c.request('eval', '2+3')).data
   await f()
   
   t = Date.now(); for(i=0;i<1000;i++) { await f()} ; Date.now()-t
   
// slower, but won't silently fail due to errors, etc.

   f2 = async () => (await c.request('eval', '2+3', {confirm:true})).data
   
Wildcard subject:

   
   c = require('@cocalc/nats/server/client').connect(); c.watch('a.*');
   
   
   c = require('@cocalc/nats/server/client').connect(); c.publish('a.x', 'foo')
   
   
Testing disconnect

   c.sub('>')
   c.conn.io.engine.close();0;
   
other:

  a=0; setInterval(()=>c.pub('a',a++), 250)

*/

import { connect as connectToSocketIO } from "socket.io-client";
import { EventIterator } from "@cocalc/util/event-iterator";
import type { ServerInfo } from "./types";
import * as msgpack from "@msgpack/msgpack";
import { randomId } from "@cocalc/nats/names";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
import { callback } from "awaiting";
import {
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/nats/util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";

export function connect(address = "http://localhost:3000", options?) {
  return new Client(address, options);
}

const INBOX_PREFIX = "_INBOX.";
const REPLY_HEADER = "CoCalc-Reply";
const DEFAULT_MAX_WAIT = 30000;
const DEFAULT_REQUEST_TIMEOUT = 10000;

enum Protocol {
  MsgPack = 0,
  JsonCodec = 1,
}

// WARNING!  This is the default and you can't just change it!
// Yes, for specific messages you can, but in general DO NOT.  The reason is because, e.g.,
// JSON will turn Dates into strings, and we no longer fix that.  So unless you modify the
// JsonCodec to handle Date's properly, don't change this!!
const PROTOCOL = Protocol.MsgPack;

interface ClientOptions {
  inboxPrefix?: string;
}

export class Client {
  public conn: ReturnType<typeof connectToSocketIO>;
  // queueGroups is a map from subject to the queue group for the subscription to that subject
  private queueGroups: { [subject: string]: string } = {};
  public info: ServerInfo | undefined = undefined;
  private readonly options: ClientOptions & { address: string };

  constructor(
    address: string,
    options: { inboxPrefix?: string; path?: string; transports? } = {},
  ) {
    this.options = { address, ...options };
    this.conn = connectToSocketIO(address, {
      path: options.path,
      // cocalc itself only works with new clients.
      // TODO: chunking + long polling is tricky; need to shrink chunk size a lot, since
      // I guess no binary protocol.
      // Also a major problem if we allow long polling is that we must always use at most
      // half the chunk size... because there is no way to know if recipients will be
      // using long polling to RECEIVE messages.
      transports: ["websocket"],
    });
    this.conn.on("info", (info) => {
      this.info = info;
    });
    this.conn.on("connect", () => {
      this.syncSubscriptions();
    });
  }

  waitUntilConnected = reuseInFlight(async () => {
    if (this.conn.connected) {
      return;
    }
    // @ts-ignore
    await once(this.conn, "connect");
  });

  // syncSubscriptions ensures that we're subscribed on server
  // to what we think we're subscribed to.
  private syncSubscriptions = async () => {
    const subs = await this.getSubscriptions();
    console.log({ subs });
    for (const subject in this.queueGroups) {
      // subscribe on backend to all subscriptions we think we should have that
      // the server does not have
      if (!subs.has(subject)) {
        this.conn.emit("subscribe", {
          subject,
          queue: this.queueGroups[subject],
        });
      }
    }
    for (const subject in subs) {
      if (this.queueGroups[subject] != null) {
        // server thinks we're subscribed but we do not, so cancel
        this.conn.emit("unsubscribe", { subject });
      }
    }
  };

  private getSubscriptions = async (): Promise<Set<string>> => {
    const f = (cb) =>
      this.conn.emit("subscriptions", null, (subs) => cb(undefined, subs));
    return new Set(await callback(f));
  };

  // returns EventEmitter that emits 'message', mesg: Message
  subscription = async (
    subject: string,
    {
      closeWhenOffCalled,
      queue,
      confirm,
    }: { closeWhenOffCalled?: boolean; queue?: string; confirm?: boolean } = {},
  ): Promise<SubscriptionEmitter> => {
    await this.waitUntilConnected();
    if (!isValidSubject(subject)) {
      throw Error(`invalid subscribe subject ${subject}`);
    }
    if (!queue) {
      queue = randomId();
    }
    if (this.queueGroups[subject] != null) {
      throw Error(`already subscribed to ${subject}`);
    }
    this.queueGroups[subject] = queue;
    if (confirm) {
      const f = (cb) => {
        this.conn.emit("subscribe", { subject, queue }, (response) => {
          cb(response?.error, response);
        });
      };
      await callback(f);
    } else {
      this.conn.emit("subscribe", { subject, queue });
    }
    const sub = new SubscriptionEmitter({
      client: this,
      subject,
      closeWhenOffCalled,
    });
    sub.once("close", () => {
      this.conn.emit("unsubscribe", { subject });
      delete this.queueGroups[subject];
    });
    return sub;
  };

  subscribe = async (
    subject: string,
    {
      maxWait,
      mesgLimit,
      queue,
      confirm,
    }: {
      maxWait?: number;
      mesgLimit?: number;
      queue?: string;
      confirm?: boolean;
    } = {},
  ): Promise<Subscription> => {
    await this.waitUntilConnected();
    const sub = await this.subscription(subject, {
      closeWhenOffCalled: true,
      queue,
      confirm,
    });
    // @ts-ignore
    return new EventIterator<Message>(sub, "message", {
      idle: maxWait,
      limit: mesgLimit,
      map: (args) => args[0],
    });
  };

  sub = this.subscribe;

  publish = async (
    subject: string,
    mesg,
    {
      protocol = PROTOCOL,
      headers,
      confirm,
    }: PublishOptions & { confirm?: boolean } = {},
  ): Promise<{ bytes: number }> => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error(`invalid publish subject ${subject}`);
    }
    await this.waitUntilConnected();
    let raw = encode({ protocol, mesg });
    // default to 1MB is safe since it's at least that big.
    const chunkSize = Math.max(1000, (this.info?.max_payload ?? 1e6) - 10000);
    let seq = 0;
    let id = randomId();
    const promises: any[] = [];
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
      if (confirm) {
        const f = (cb) => {
          this.conn.emit("publish", v, (response) => {
            cb(response?.error);
          });
        };
        const promise = (async () => await callback(f))();
        promises.push(promise);
      } else {
        this.conn.emit("publish", v);
      }
      seq += 1;
    }
    if (confirm) {
      await Promise.all(promises);
    }
    return { bytes: raw.length };
  };

  pub = this.publish;

  request = async (
    subject: string,
    mesg: any,
    {
      confirm,
      timeout = DEFAULT_REQUEST_TIMEOUT,
      ...options
    }: PublishOptions & { timeout?: number; confirm?: boolean } = {},
  ): Promise<Message> => {
    const inboxSubject = this.getTemporaryInboxSubject();
    await this.waitUntilConnected();
    const sub = await this.subscribe(inboxSubject, {
      maxWait: timeout,
      mesgLimit: 1,
      confirm,
    });
    await this.publish(subject, mesg, {
      confirm,
      headers: { ...options, [REPLY_HEADER]: inboxSubject },
    });
    for await (const resp of sub) {
      sub.stop();
      return resp;
    }
    sub.stop();
    throw Error("timeout");
  };

  async *requestMany(
    subject: string,
    mesg: any,
    {
      maxMessages,
      maxWait = DEFAULT_MAX_WAIT,
      confirm,
      ...options
    }: PublishOptions & {
      maxWait?: number;
      maxMessages?: number;
      confirm?: boolean;
    } = {},
  ) {
    await this.waitUntilConnected();
    const inboxSubject = this.getTemporaryInboxSubject();
    const sub = await this.subscribe(inboxSubject, {
      maxWait,
      mesgLimit: maxMessages,
      confirm,
    });
    await this.publish(subject, mesg, {
      headers: { ...options, [REPLY_HEADER]: inboxSubject },
      confirm,
    });
    let count = 0;
    for await (const resp of sub) {
      yield resp;
      count += 1;
      if (maxMessages && count >= maxMessages) {
        console.log({ count, maxMessages });
        sub.end();
        return;
      }
    }
    sub.end();
    throw Error("timeout");
  }

  watch = async (
    subject: string,
    cb = (x) => console.log(`${x.subject}:`, x.data),
    opts?,
  ) => {
    await this.waitUntilConnected();
    const sub = await this.subscribe(subject, opts);
    const f = async () => {
      for await (const x of sub) {
        cb(x);
      }
    };
    f();
    return sub;
  };

  private getTemporaryInboxSubject = () =>
    `${this.options.inboxPrefix ?? INBOX_PREFIX}${randomId()}`;
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

class SubscriptionEmitter extends EventEmitter {
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

  private handle = ({ subject, data }) => {
    if (this.client == null) {
      return;
    }
    const [id, seq, done, protocol, buffer, headers] = data;
    // console.log({ id, seq, done, protocol, buffer, headers });
    const chunk = { seq, done, protocol, buffer, headers };
    const { incoming } = this;
    if (incoming[id] == null) {
      if (seq != 0) {
        // part of a dropped message -- by definition this should just
        // silently happen and be handled via application level protocols
        // elsewhere
        console.log("drop -- first message has wrong seq", { seq });
        this.emit("drop");
        return;
      }
      incoming[id] = [];
    } else {
      const prev = incoming[id].slice(-1)[0].seq ?? -100;
      if (prev + 1 != seq) {
        console.log("drop -- seq mismatch", { prev, seq });
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
      global.y = { chunks, concatArrayBuffers, decode };
      const data = concatArrayBuffers(chunks);
      delete incoming[id];
      const mesg = new Message({
        data: decode({ protocol, data }),
        headers,
        client: this.client,
        subject,
      });
      this.emit("message", mesg);
    }
  };
}

function concatArrayBuffers(buffers) {
  if (buffers.length == 1) {
    return buffers[0];
  }
  if (Buffer.isBuffer(buffers[0])) {
    return Buffer.concat(buffers);
  }
  // browser fallback
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return result.buffer;
}

export class Message {
  private client: Client;
  public readonly data: any;
  public readonly headers: JSONValue;
  public readonly subject;

  constructor({ data, headers, client, subject }) {
    this.data = data;
    this.headers = headers;
    this.client = client;
    this.subject = subject;
  }

  respond = async (data: any) => {
    const subject = this.headers?.[REPLY_HEADER];
    if (!subject) {
      throw Error("message is not a request");
    }
    await this.client.publish(subject, data);
  };
}

export type Subscription = EventIterator<Message>;
