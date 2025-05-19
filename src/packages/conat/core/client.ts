/*
core/client.s -- core conats client 

This is a client that has a 
similar API to NATS / Socket.io, but is much, much better in so many ways:

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
       
       
THE CORE API

This section contains the crucial information you have to know to build a distributed
system using Conat.   It's our take on the NATS primitives (it's not exactly the
same, but it is close).  It's basically a symmetrical pub/sub/reqest/respond model 
for messaging on which you can build distributed systems.  The tricky part, which 
NATS.js gets wrong (in my opinion), is implementing  this in a way that is robust 
and scalable, in terms for authentication, real world browser connectivity and
so on.  Our approach is to use proven mature technology like socket.io, sqlite
and valkey, instead of writing everything from scratch.

Clients: We view all clients as plugged into a common "dial tone", 
except for optional permissions that are configured when starting the server.
The methods you call on the client to build everything are:

 - subscribe, subscribeSync - subscribe to a subject which returns an
   async iterator over all messages that match the subject published by 
   anyone with permission to do so.   If you provide the same optional 
   queue parameter for multiple subscribers, then one subscriber in each queue group
   receives each message. The async form confirms the subscription was created 
   before returning. A client may only create one subscription to a 
   given subject at a time, to greatly reduce the chance of leaks and 
   simplify code.  **There is no size limit on messages.**
   Subscriptions are guaranteed to stay valid until the client ends them;
   they do not stop working due to client or server reconnects or restarts.
   
 - publish, publishSync - publish to a subject. The async version returns
   a count of the number of recipients, whereas the sync version is 
   fire-and-forget.

 - request - send a message to a subject, and if there is at least one
   subscriber listening, it may respond.  If there are no subscribers,
   it throws a 503 error.  To create a microservice, subscribe
   to a subject pattern and called mesg.respond(...) on each message you
   receive.
   
 - requestMany - send a message to a subject, and receive many
   messages in reply.   Typically you end the response stream by sending
   a null message, but what you do is up to you.  This is very useful
   for streaming arbitrarily large data, long running changefeeds, LLM
   responses, etc.
   
   
Messages:  A message mesg is:
  
 - Data:
   - subject  - the subject the message was sent to
   - encoding - usually MessagePack
   - raw      - encoded binary data
   - headers  - a JSON-able Javascript object.
 
 - Methods:
   - data: this is a property, so if you do mesg.data, then it decodes raw
     and returns the resulting Javascript object.
   - respond, respondSync: if REPLY_HEADER is set, calling this publishes a 
     respond message to the original sender of the message.
   

Persistence:

We also implement persistent streams, where you can also set a key.  This can
be used to build the analogue of Jetstream's streams and kv stores.  The object
store isn't necessary since there is no limit on message size.  Conat's persistent
streams are compressed by default and backed by individual sqlite files, which
makes them very memory efficient and it is easy to tier storage to cloud storage.
   
UNIT TESTS: See packages/server/nats/test/core
   
MISC NOTES:

NOTE: There is a socketio msgpack parser, but it just doesn't
work at all, which is weird.  Also, I think it's impossible to
do the sort of chunking we want at the level of a socket.io
parser -- it's just not possible in that the encoding.  We customize
things purely client side without using a parser, and get a much
simpler and better result, inspired by how NATS approaches things
with opaque messages.


SUBSCRIPTION ROBUSTNESS: When you call client.subscribe(...) you get back an async iterator.
It ONLY ends when you explicitly do the standard ways of terminating
such an iterator, including calling .close() on it.  It is a MAJOR BUG
if it were to terminate for any other reason.  In particular, the subscription
MUST NEVER throw an error or silently end when the connection is dropped 
then resumed, or the server is restarted, or the client connects to 
a different server!  These situations can, of course, result in missing
some messages, but that's understood.  There are no guarantees at all with
a subscription that every message is received.  That said, we have enabled
connectionStateRecovery (and added special conat support for it) so no messages
are dropped for temporary disconnects, even up to several minutes,
and even in valkey cluster mode!  Finally, any time a client disconnects
and reconnects, the client ensures that all subscriptions exist for it on the server
via a sync process.

Subscription robustness is a major difference with NATS.js, which would
mysteriously terminate subscriptions for a variety of reasons, meaning that any
code using subscriptions had to be wrapped in ugly complexity to be
usable in production.

USAGE:

The following should mostly work to interactively play around with this
code and develop it.  It's NOT automatically tested and depends on your
environment though, so may break.  See the unit tests in 

        packages/server/nats/test/core/ 

for something that definitely works perfectly.


For developing at the command line, cd to packages/backend, then in node:

   c = require('@cocalc/backend/conat/conat').connect()
   
or

   c = require('@cocalc/conat/core/client').connect('http://localhost:3000')

   c.watch('a')

   s = await c.subscribe('a');  for await (const x of s) { console.log(x.length)}
   
// in another console

   c = require('@cocalc/backend/conat/conat').connect()
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

   
   c = require('@cocalc/conat/core/client').connect(); c.watch('a.*');
   
   
   c = require('@cocalc/conat/core/client').connect(); c.publish('a.x', 'foo')
   
   
Testing disconnect

   c.sub('>')
   c.conn.io.engine.close();0;
   
other:

  a=0; setInterval(()=>c.pub('a',a++), 250)

*/

import {
  connect as connectToSocketIO,
  type SocketOptions,
  type ManagerOptions,
} from "socket.io-client";
import { EventIterator } from "@cocalc/util/event-iterator";
import type { ServerInfo } from "./types";
import * as msgpack from "@msgpack/msgpack";
import { randomId } from "@cocalc/conat/names";
import type { JSONValue } from "@cocalc/util/types";
import { EventEmitter } from "events";
import { callback } from "awaiting";
import {
  isValidSubject,
  isValidSubjectWithoutWildcards,
} from "@cocalc/conat/util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("core/client");

interface Options {
  inboxPrefix?: string;
  path?: string;
}

export type ConnectOptions = Options & {
  noCache?: boolean;
} & Partial<SocketOptions> &
  Partial<ManagerOptions>;

let theClient: Client | undefined = undefined;
export function connect(
  address = "http://localhost:3000",
  options?: ConnectOptions,
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
const MAX_HEADER_SIZE = 100000;

export enum DataEncoding {
  MsgPack = 0,
  JsonCodec = 1,
}

interface SubscriptionOptions {
  maxWait?: number;
  mesgLimit?: number;
  queue?: string;
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
  private inboxSubject: string;
  private inbox?: EventEmitter;

  constructor(address: string, options: Options = {}) {
    this.options = { address, ...options };

    this.conn = connectToSocketIO(address, {
      // cocalc itself only works with new clients.
      // TODO: chunking + long polling is tricky; need to shrink chunk size a lot, since
      // I guess no binary protocol.
      // Also a major problem if we allow long polling is that we must always use at most
      // half the chunk size... because there is no way to know if recipients will be
      // using long polling to RECEIVE messages.
      transports: ["websocket"],
      ...options,
    });
    this.conn.on("info", (info) => {
      this.info = info;
    });
    this.conn.on("connect", () => {
      logger.debug(`Conat: Connected to ${this.options.address}`);
      this.syncSubscriptions();
    });

    this.initInbox();
  }

  private temporaryInboxSubject = () => {
    if (!this.inboxSubject) {
      throw Error("inbox not setup properly");
    }
    return `${this.inboxSubject}.${randomId()}`;
  };

  private initInbox = () => {
    // For request/respond instead of setting up one
    // inbox *every time there is a request*, we setup a single
    // inbox once and for all for all responses.  We listen for
    // everything to inbox...Prefix.* and emit it via this.inbox.
    // The request sender then listens on this.inbox for the response.
    // We *could* use a regular subscription for each request,
    // but (1) that massively increases the load on the server for
    // every single request (having to create and destroy subscriptions)
    // and (2) there is a race condition between creating that subscription
    // and getting the response; it's fine with one server, but with
    // multiple servers solving the race condition would slow everything down
    // due to having to wait for so many acknowledgements.  Instead, we
    // remove all those problems by just using a single inbox subscription.
    const inboxPrefix = this.options.inboxPrefix ?? INBOX_PREFIX;
    if (!inboxPrefix.startsWith(INBOX_PREFIX)) {
      throw Error(`custom inboxPrefix must start with '${INBOX_PREFIX}'`);
    }
    this.inboxSubject = `${inboxPrefix}.${randomId()}`;
    let sub;
    try {
      sub = this.subscribeSync(this.inboxSubject + ".*");
    } catch (err) {
      // this should only fail due to permissions issues, at which point
      // request can't work, but pub/sub can.
      logger.debug(`WARNING: inbox not available -- ${err}`);
      this.inboxSubject = "";
      return;
    }
    this.inbox = new EventEmitter();
    (async () => {
      for await (const mesg of sub) {
        if (this.inbox == null) {
          return;
        }
        this.inbox.emit(mesg.subject, mesg);
      }
    })();
  };

  // There should usually be no reason to call this because socket.io
  // is so good at abstracting this away. It's useful for unit testing.
  waitUntilConnected = reuseInFlight(async () => {
    if (this.conn.connected) {
      return;
    }
    // @ts-ignore
    await once(this.conn, "connect");
  });

  close = () => {
    for (const subject in this.queueGroups) {
      this.conn.emit("unsubscribe", { subject });
      delete this.queueGroups[subject];
    }
    // @ts-ignore
    delete this.queueGroups;
    this.conn.close();
    theClient = undefined;
    // @ts-ignore
    delete this.inboxSubject;
    delete this.inbox;
    // @ts-ignore
    delete this.options;
    // @ts-ignore
    delete this.info;
  };

  // syncSubscriptions ensures that we're subscribed on server
  // to what we think we're subscribed to.
  private syncSubscriptions = async () => {
    const subs = await this.getSubscriptions();
    // logger.debug`Conat: restoring subscriptions`, Array.from(subs));
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
  private subscriptionEmitter = (
    subject: string,
    {
      closeWhenOffCalled,
      queue,
      confirm,
    }: { closeWhenOffCalled?: boolean; queue?: string; confirm?: boolean } = {},
  ): { sub: SubscriptionEmitter; promise? } => {
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
    const sub = new SubscriptionEmitter({
      client: this,
      subject,
      closeWhenOffCalled,
    });
    let promise;
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
      promise = callback(f);
    } else {
      this.conn.emit("subscribe", { subject, queue });
      promise = undefined;
    }
    sub.once("close", () => {
      if (this.queueGroups?.[subject] == null) {
        return;
      }
      this.conn.emit("unsubscribe", { subject });
      delete this.queueGroups[subject];
    });
    return { sub, promise };
  };

  private subscriptionIterator = (
    sub,
    opts?: SubscriptionOptions,
  ): Subscription => {
    // @ts-ignore
    const iter = new EventIterator<Message>(sub, "message", {
      idle: opts?.maxWait,
      limit: opts?.mesgLimit,
      map: (args) => args[0],
    });
    return iter;
  };

  subscribeSync = (
    subject: string,
    opts?: SubscriptionOptions,
  ): Subscription => {
    const { sub } = this.subscriptionEmitter(subject, {
      closeWhenOffCalled: true,
      queue: opts?.queue,
      confirm: false,
    });
    return this.subscriptionIterator(sub, opts);
  };

  subscribe = async (
    subject: string,
    opts?: SubscriptionOptions,
  ): Promise<Subscription> => {
    const { sub, promise } = this.subscriptionEmitter(subject, {
      closeWhenOffCalled: true,
      queue: opts?.queue,
      confirm: true,
    });
    await promise;
    return this.subscriptionIterator(sub, opts);
  };

  sub = this.subscribe;

  publishSync = (
    subject: string,
    mesg,
    opts?: PublishOptions,
  ): { bytes: number } => {
    return this._publish(subject, mesg, opts);
  };

  publish = async (
    subject: string,
    mesg,
    opts?: PublishOptions,
  ): Promise<{
    // bytes encoded (doesn't count some extra wrapping)
    bytes: number;
    // count is the number of matching subscriptions
    // that the server *sent* this message to since the server knows about them.
    // However, there's no guaranteee that the subscribers actually exist
    // **right now** or received these messages.
    count: number;
  }> => {
    const { bytes, getCount, promise } = this._publish(subject, mesg, {
      ...opts,
      confirm: true,
    });
    await promise;
    return { bytes, count: getCount?.()! };
  };

  private _publish = (
    subject: string,
    mesg,
    {
      headers,
      raw,
      encoding = DEFAULT_ENCODING,
      confirm,
    }: PublishOptions & { confirm?: boolean } = {},
  ) => {
    if (!isValidSubjectWithoutWildcards(subject)) {
      throw Error(`invalid publish subject ${subject}`);
    }
    raw = raw ?? encode({ encoding, mesg });
    // default to 1MB is safe since it's at least that big.
    const chunkSize = Math.max(
      1000,
      (this.info?.max_payload ?? 1e6) - MAX_HEADER_SIZE,
    );
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
      return {
        bytes: raw.length,
        getCount: () => count,
        promise: Promise.all(promises),
      };
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
    if (timeout <= 0) {
      throw Error("timeout must be positive");
    }
    const inboxSubject = this.temporaryInboxSubject();
    if (this.inbox == null) {
      throw Error("inbox not configured");
    }
    const sub = new EventIterator<Message>(this.inbox, inboxSubject, {
      idle: timeout,
      limit: 1,
      map: (args) => args[0],
    });

    const { count } = await this.publish(subject, mesg, {
      ...options,
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
    if (maxMessages != null && maxMessages <= 0) {
      throw Error("maxMessages must be positive");
    }
    if (maxWait != null && maxWait <= 0) {
      throw Error("maxWait must be positive");
    }
    const inboxSubject = this.temporaryInboxSubject();
    if (this.inbox == null) {
      throw Error("inbox not configured");
    }
    const sub = new EventIterator<Message>(this.inbox, inboxSubject, {
      idle: maxWait,
      limit: maxMessages,
      map: (args) => args[0],
    });
    const { count } = await this.publish(subject, mesg, {
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

  // watch: this is mainly for debugging and interactive use.
  watch = (
    subject: string,
    cb = (x) => console.log(`${x.subject}:`, x.data, x.headers),
    opts?,
  ) => {
    const sub = this.subscribeSync(subject, opts);
    const f = async () => {
      for await (const x of sub) {
        cb(x);
      }
    };
    f();
    return sub;
  };
}

interface PublishOptions {
  headers?: Headers;
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

  get length() {
    // raw is binary data so it's the closest thing we have to the
    // size of this message.  It would also make sense to include
    // the headers, but JSON'ing them would be expensive, so we don't.
    return this.raw.length;
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

  private respondSubject = () => {
    const subject = this.headers?.[REPLY_HEADER];
    if (!subject) {
      console.log(
        `WARNING: respond -- message to '${this.subject}' is not a request`,
      );
      return;
    }
    return `${subject}`;
  };

  respondSync = (mesg, opts?: PublishOptions): { bytes: number } => {
    const subject = this.respondSubject();
    if (!subject) return { bytes: 0 };
    return this.client.publishSync(subject, mesg, opts);
  };

  respond = async (
    mesg,
    opts: PublishOptions = {},
  ): Promise<{ bytes: number; count: number }> => {
    const subject = this.respondSubject();
    if (!subject) {
      return { bytes: 0, count: 0 };
    }
    return await this.client.publish(subject, mesg, opts);
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
