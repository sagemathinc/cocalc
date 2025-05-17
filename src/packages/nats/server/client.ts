/*

This is a client that has a similar API to NATS / Socket.io, but is much,
much better in so many ways:

- It has global pub/sub just like with NATS. This uses the server to
  rebroadcast messages, and for authentication. 
    Better than NATS: Authentication is done for a subject *as 
    needed* instead of at connection time.

- Message can be arbitrarily large and they are *automatically* divided
  into chunks and reassembled.   Better than both NATS and socket.io.
  
- There are multiple supported ways of encoding messages, and
  no coordination is required with the server or other clients!  E.g.,
  one message can be sent with one encoding and the next with a different
  encoding and that's fine. 
     - MsgPack: https://msgpack.org/ -- a very compact encoding that handles
       dates nicely and small numbers efficiently.  This also works 
       well with binary Buffer objects, which is nice.
     - JsonCodec: uses JSON.stringify and TextEncoder.  This does not work
       with Buffer or Date and is less compact, but can be very fast.


NOTE: There is a socketio msgpack parser, but it just doesn't
work at all, which is weird.  Also, I think it's impossible to
do the sort of chunking we want at the level of a socket.io
parser -- it's just not possible in that the encoding.  We customize
things purely client side without using a parser, and get a much
simpler and better result, inspired by how NATS approaches things
with opaque messages.


SUBSCRIPTION ROBUSTNESS: When you call client.subscribe(...) you get back an async iterator.
It ONLY ends when you explicitly do the standard ways of terminating
such an iterator, including calling .stop() on it.  It is a MAJOR BUG
if it were to terminate for any other reason.  In particular, the subscription
MUST NEVER throw an error or silently end when the connection is dropped 
then resumed, or the server is restarted, or the client connects to 
a different server!  These situations can, of course, result in missing
some messages, but that's understood.  There are no guarantees at all with
a subscription that every message is received.  That said, we have enabled
connectionStateRecovery (and added special conat support for it) so no messages
are dropped for temporary disconnects, even up to several minutes,
and even in valkey cluster mode!  Finally, any time a client disconnects
and reconnects, it ensures that all subscriptions exist for it on the server
via a sync process.

Subscription robustness is a major difference with nats.js, which would randomly
mysteriously terminate subscriptions for a variety of reasons, meaning that any
code using subscriptions had to be wrapped in a page of ugly complexity to be
usable in production.

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

interface Options {
  inboxPrefix?: string;
  path?: string;
}

let theClient: Client | undefined = undefined;
export function connect(
  address = "http://localhost:3000",
  options?: Options & { noCache?: boolean },
) {
  const noCache = options?.noCache;
  if (!noCache && theClient !== undefined) {
    return theClient;
  }
  const client = new Client(address, options);
  if (!noCache) {
    theClient = client;
  }
  return client;
}

const INBOX_PREFIX = "_INBOX";
const REPLY_HEADER = "CoCalc-Reply";
const DEFAULT_MAX_WAIT = 30000;
const DEFAULT_REQUEST_TIMEOUT = 10000;

export enum DataEncoding {
  MsgPack = 0,
  JsonCodec = 1,
}

// WARNING!  This is the default and you can't just change it!
// Yes, for specific messages you can, but in general DO NOT.  The reason is because, e.g.,
// JSON will turn Dates into strings, and we no longer fix that.  So unless you modify the
// JsonCodec to handle Date's properly, don't change this!!
const DEFAULT_ENCODING = DataEncoding.MsgPack;

interface ClientOptions {
  inboxPrefix?: string;
}

export class Client {
  public conn: ReturnType<typeof connectToSocketIO>;
  // queueGroups is a map from subject to the queue group for the subscription to that subject
  private queueGroups: { [subject: string]: string } = {};
  public info: ServerInfo | undefined = undefined;
  private readonly options: ClientOptions & { address: string };

  constructor(address: string, options: Options = {}) {
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
      console.log(`Conat: Connected to ${this.options.address}`);
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
    // console.log(`Conat: restoring subscriptions`, Array.from(subs));
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
      throw Error(`invalid subscribe subject '${subject}'`);
    }
    if (!queue) {
      queue = randomId();
    }
    if (this.queueGroups[subject] != null) {
      throw Error(`already subscribed to '${subject}'`);
    }
    this.queueGroups[subject] = queue;
    if (confirm) {
      const f = (cb) => {
        this.conn.emit("subscribe", { subject, queue }, (response) => {
          if (response?.error) {
            cb(new ConatError(response.error, { code: response.code }));
          } else {
            cb(response?.error, response);
          }
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
    { headers, raw, encoding = DEFAULT_ENCODING, confirm }: PublishOptions = {},
  ): Promise<{
    // bytes encoded (doesn't count some extra wrapping)
    bytes: number;
    // if confirm is true, count is the number of matching subscriptions
    // that the server sent this message to. There's no guaranteee that
    // the subscribers actually exist right now or received these messages.
    count?: number;
  }> => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error(`invalid publish subject ${subject}`);
    }
    await this.waitUntilConnected();
    raw = raw ?? encode({ encoding, mesg });
    // default to 1MB is safe since it's at least that big.
    const chunkSize = Math.max(1000, (this.info?.max_payload ?? 1e6) - 10000);
    let seq = 0;
    let id = randomId();
    const promises: any[] = [];
    let count = 0;
    for (let i = 0; i < raw.length; i += chunkSize) {
      const done = i + chunkSize >= raw.length ? 1 : 0;
      const v: any[] = [
        subject,
        id,
        seq,
        done,
        encoding,
        raw.slice(i, i + chunkSize),
      ];
      if (done && headers) {
        v.push(headers);
      }
      if (confirm) {
        const f = (cb) => {
          this.conn.emit("publish", v, (response) => {
            if (response?.error) {
              cb(new ConatError(response.error, { code: response.code }));
            } else {
              cb(response?.error, response);
            }
          });
        };
        const promise = (async () => {
          const response = await callback(f);
          count = Math.max(count, response.count ?? 0);
        })();
        promises.push(promise);
      } else {
        this.conn.emit("publish", v);
      }
      seq += 1;
    }
    if (confirm) {
      await Promise.all(promises);
      return { bytes: raw.length, count };
    }
    return { bytes: raw.length };
  };

  pub = this.publish;

  request = async (
    subject: string,
    mesg: any,
    {
      timeout = DEFAULT_REQUEST_TIMEOUT,
      ...options
    }: PublishOptions & { timeout?: number } = {},
  ): Promise<Message> => {
    const inboxSubject = this.getTemporaryInboxSubject();
    await this.waitUntilConnected();
    const sub = await this.subscribe(inboxSubject, {
      maxWait: timeout,
      mesgLimit: 1,
      confirm: false,
    });
    const { count } = await this.publish(subject, mesg, {
      ...options,
      confirm: true,
      headers: { ...options?.headers, [REPLY_HEADER]: inboxSubject },
    });
    if (!count) {
      sub.stop();
      throw new ConatError(`request -- no subscribers matching ${subject}`, {
        code: 503,
      });
    }
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
      ...options
    }: PublishOptions & {
      maxWait?: number;
      maxMessages?: number;
    } = {},
  ) {
    await this.waitUntilConnected();
    const inboxSubject = this.getTemporaryInboxSubject();
    const sub = await this.subscribe(inboxSubject, {
      maxWait,
      mesgLimit: maxMessages,
      confirm: false,
    });
    const { count } = await this.publish(subject, mesg, {
      confirm: true,
      headers: { ...options?.headers, [REPLY_HEADER]: inboxSubject },
    });
    if (!count) {
      sub.stop();
      throw new ConatError(
        `requestMany -- no subscribers matching ${subject}`,
        { code: 503 },
      );
    }
    let numMessages = 0;
    for await (const resp of sub) {
      yield resp;
      numMessages += 1;
      if (maxMessages && numMessages >= maxMessages) {
        sub.end();
        return;
      }
    }
    sub.end();
    throw new ConatError("timeout", { code: 408 });
  }

  watch = async (
    subject: string,
    cb = (x) => console.log(`${x.subject}:`, x.data, x.headers),
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
    `${this.options.inboxPrefix ?? INBOX_PREFIX}.${randomId()}`;
}

interface PublishOptions {
  headers?: Headers;
  confirm?: boolean;
  // if encoding is given, it specifies the encoding used to encode the message
  encoding?: DataEncoding;
  // if raw is given, then it is assumed to be the raw binary
  // encoded message (using encoding) and any mesg parameter
  // is *IGNORED*.
  raw?;
}

function encode({ encoding, mesg }: { encoding: DataEncoding; mesg: any }) {
  if (encoding == DataEncoding.MsgPack) {
    return msgpack.encode(mesg);
  } else if (encoding == DataEncoding.JsonCodec) {
    return jsonEncoder(mesg);
  } else {
    throw Error(`unknown encoding ${encoding}`);
  }
}

function decode({ encoding, data }: { encoding: DataEncoding; data }): any {
  if (encoding == DataEncoding.MsgPack) {
    return msgpack.decode(data);
  } else if (encoding == DataEncoding.JsonCodec) {
    return jsonDecoder(data);
  } else {
    throw Error(`unknown encoding ${encoding}`);
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
    const [id, seq, done, encoding, buffer, headers] = data;
    // console.log({ id, seq, done, encoding, buffer, headers });
    const chunk = { seq, done, encoding, buffer, headers };
    const { incoming } = this;
    if (incoming[id] == null) {
      if (seq != 0) {
        // part of a dropped message -- by definition this should just
        // silently happen and be handled via application level encodings
        // elsewhere
        console.log("WARNING: drop -- first message has wrong seq", { seq });
        this.emit("drop");
        return;
      }
      incoming[id] = [];
    } else {
      const prev = incoming[id].slice(-1)[0].seq ?? -100;
      if (prev + 1 != seq) {
        console.log("WARNING: drop -- seq mismatch", { prev, seq });
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
      const raw = concatArrayBuffers(chunks);
      delete incoming[id];
      const mesg = new Message({
        encoding,
        raw,
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

export type Headers = { [key: string]: JSONValue };

export class MessageData {
  public readonly encoding: DataEncoding;
  public readonly raw;
  public readonly headers?: Headers;

  constructor({ encoding, raw, headers }) {
    this.encoding = encoding;
    this.raw = raw;
    this.headers = headers;
  }

  get data() {
    return decode({ encoding: this.encoding, data: this.raw });
  }
}

export class Message extends MessageData {
  private client: Client;
  public readonly subject;

  constructor({ encoding, raw, headers, client, subject }) {
    super({ encoding, raw, headers });
    this.client = client;
    this.subject = subject;
  }

  respond = async (data: any, options: PublishOptions = {}) => {
    const subject = this.headers?.[REPLY_HEADER];
    if (!subject) {
      console.log(
        `WARNING: respond -- message to ${this.subject} is not a request`,
      );
      return;
    }
    await this.client.publish(`${subject}`, data, options);
  };
}

export function messageData(
  mesg,
  { headers, raw, encoding = DEFAULT_ENCODING }: PublishOptions = {},
) {
  return new MessageData({
    encoding,
    raw: raw ?? encode({ encoding, mesg }),
    headers,
  });
}

export type Subscription = EventIterator<Message>;

export class ConatError extends Error {
  code: string;
  constructor(mesg: string, { code }) {
    super(mesg);
    this.code = code;
  }
}
