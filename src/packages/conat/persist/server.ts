/*
CONAT_SERVER=http://localhost:3000 node

// making a server from scratch

// initialize persist context

require('@cocalc/backend/conat/persist');

// a conat server and client
s = require('@cocalc/conat/core/server').init({port:4567, getUser:()=>{return {hub_id:'hub'}}}); client = s.client();

// persist server
p = require('@cocalc/conat/persist/server').server({client}); 0;



// a client for persist server

c = require('@cocalc/conat/persist/client').stream({client, user:{hub_id:'hub'}, storage:{path:'b.txt'}});

for await (x of await c.getAll()) { console.log(x) }


await c.set({messageData:client.message(123)})

for await (x of await c.getAll()) { console.log(x) }

[ { seq: 1, time: 1750218209211, encoding: 0, raw: <Buffer 7b> } ]

(await c.get({seq:5})).data

await c.set({key:'foo', messageData:client.message('bar')})
(await c.get({key:'foo'})).data

await c.delete({seq:6})


client = await require('@cocalc/backend/conat').conat(); kv = require('@cocalc/backend/conat/sync').akv({project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f', name:'a.txt', client})

client = await require('@cocalc/backend/conat').conat(); s = require('@cocalc/backend/conat/sync').astream({project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f', name:'b.txt', client})

client = await require('@cocalc/backend/conat').conat(); s = await require('@cocalc/backend/conat/sync').dstream({project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f', name:'ds2.txt', client})


client = await require('@cocalc/backend/conat').conat(); kv = require('@cocalc/backend/conat/sync').akv({project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f', name:'a.txt', client})


client = await require('@cocalc/backend/conat').conat(); kv = await require('@cocalc/backend/conat/sync').dkv({project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f', name:'a1', client})


client = await require('@cocalc/backend/conat').conat(); s = await require('@cocalc/conat/sync/core-stream').cstream({name:'d.txt',client})


*/

import { type Client, ConatError } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import type {
  StoredMessage,
  PersistentStream,
  StorageOptions,
} from "./storage";
import { getStream, SERVICE, MAX_PER_USER, MAX_GLOBAL, RESOURCE } from "./util";
import { throttle } from "lodash";
import { type SetOptions } from "./client";
import { once } from "@cocalc/util/async-utils";
import { UsageMonitor } from "@cocalc/conat/monitor/usage";
import { getLogger } from "@cocalc/conat/client";
import { initLoadBalancer } from "./load-balancer";

const logger = getLogger("persist:server");

// When sending a large number of message for
// getAll or change updates, we combine together messages
// until hitting this size, then send them all at once.
// This bound is to avoid potentially using a huge amount of RAM
// when streaming a large saved database to the client.
// Note: if a single message is larger than this, it still
// gets sent, just individually.
const DEFAULT_MESSAGES_THRESH = 20 * 1e6;
//const DEFAULT_MESSAGES_THRESH = 1e5;

// I added an experimental way to run any sqlite query... but it is disabled
// since of course there are major DOS and security concerns.
const ENABLE_SQLITE_GENERAL_QUERIES = false;

const SEND_THROTTLE = 30;

export function server({
  client,
  messagesThresh = DEFAULT_MESSAGES_THRESH,
  service = SERVICE,
  id = "0",
  clusterMode,
}: {
  client: Client;
  messagesThresh?: number;
  service?: string;
  id?: string;
  // if false, runs it's own internal load balancer that always returns this server
  clusterMode?: boolean;
}): ConatSocketServer {
  const log = (...args) => {
    logger.debug(id, service, ...args);
  };
  log("server: creating persist server");
  if (client == null) {
    throw Error("client must be specified");
  }
  const subject = `${service}.*`;
  const server: ConatSocketServer = client.socket.listen(subject, { id });
  log("server listening", { subject, id });
  if (!clusterMode) {
    log("persist server not in cluster mode, so starting own load balancer");
    initLoadBalancer({ service, ids: [id], client });
  }
  const usage = new UsageMonitor({
    maxPerUser: MAX_PER_USER,
    max: MAX_GLOBAL,
    resource: RESOURCE,
    log: (...args) => {
      log(RESOURCE, ...args);
    },
  });

  server.on("close", () => {
    log("stopping persist server", { id, service });
    usage.close();
  });

  server.on("connection", (socket: ServerSocket) => {
    log("server: got new connection", {
      id,
      service,
      subject: socket.subject,
    });
    //     console.log(new Date(), "persist server got connection", {
    //       persist: client.info.id,
    //       subject: socket.subject,
    //     });
    let error = "";
    let errorCode: any = undefined;
    let changefeed = false;
    let storage: undefined | StorageOptions = undefined;
    let stream: undefined | PersistentStream = undefined;
    let user = "";
    let added = false;
    socket.on("data", async (data) => {
      // log("server: got data ", data);
      if (stream == null) {
        storage = data.storage;
        changefeed = data.changefeed;
        try {
          user = socket.subject.split(".")[1];
          usage.add(user);
          added = true;
          stream = await getStream({
            subject: socket.subject,
            storage,
            service,
          });
          if (changefeed) {
            startChangefeed({ socket, stream, messagesThresh });
          }
          socket.emit("stream-initialized");
        } catch (err) {
          error = `${err}`;
          errorCode = err.code;
          socket.write(null, { headers: { error, code: errorCode } });
        }
      }
    });
    socket.on("closed", () => {
      log("socket closed", id, socket.subject);
      storage = undefined;
      stream?.close();
      stream = undefined;
      if (added) {
        usage.delete(user);
      }
    });

    socket.on("request", async (mesg) => {
      const request = mesg.headers;
      // log("got request", request);

      try {
        if (error) {
          throw new ConatError(error, { code: errorCode });
        }
        if (stream == null) {
          await once(socket, "stream-initialized", request.timeout ?? 30000);
        }
        if (stream == null) {
          throw Error("bug");
        }
        if (request.cmd == "set") {
          mesg.respondSync(
            stream.set({
              key: request.key,
              previousSeq: request.previousSeq,
              raw: mesg.raw,
              ttl: request.ttl,
              encoding: mesg.encoding,
              headers: request.headers,
              msgID: request.msgID,
            }),
          );
        } else if (request.cmd == "setMany") {
          // just like set except the main data of the mesg
          // has an array of set operations
          const resp: (
            | { seq: number; time: number }
            | { error: string; code?: any }
          )[] = [];
          for (const {
            key,
            previousSeq,
            ttl,
            msgID,
            messageData,
          } of mesg.data as SetOptions[]) {
            try {
              resp.push(
                stream.set({
                  key,
                  previousSeq,
                  ttl,
                  headers: messageData.headers,
                  msgID,
                  raw: messageData.raw,
                  encoding: messageData.encoding,
                }),
              );
            } catch (err) {
              resp.push({ error: `${err}`, code: err.code });
            }
          }
          mesg.respondSync(resp);
        } else if (request.cmd == "delete") {
          mesg.respondSync(stream.delete(request));
        } else if (request.cmd == "config") {
          mesg.respondSync(stream.config(request.config));
        } else if (request.cmd == "inventory") {
          mesg.respondSync(stream.inventory());
        } else if (request.cmd == "get") {
          const resp = stream.get({ key: request.key, seq: request.seq });
          //console.log("got resp = ", resp);
          if (resp == null) {
            mesg.respondSync(null);
          } else {
            const { raw, encoding, headers, seq, time, key } = resp;
            mesg.respondSync(null, {
              raw,
              encoding,
              headers: { ...headers, seq, time, key },
            });
          }
        } else if (request.cmd == "keys") {
          const resp = stream.keys();
          mesg.respondSync(resp);
        } else if (request.cmd == "sqlite") {
          if (!ENABLE_SQLITE_GENERAL_QUERIES) {
            throw Error("sqlite command not currently supported");
          }
          const resp = stream.sqlite(request.statement, request.params);
          mesg.respondSync(resp);
        } else if (request.cmd == "serverId") {
          mesg.respondSync(server.id);
        } else if (request.cmd == "getAll") {
          log("getAll", { subject: socket.subject, request });
          // getAll uses requestMany which responds with all matching messages,
          // so no call to mesg.respond here.
          getAll({ stream, mesg, request, messagesThresh });
        } else if (request.cmd == "changefeed") {
          log("changefeed", changefeed);
          if (!changefeed) {
            changefeed = true;
            startChangefeed({ socket, stream, messagesThresh });
          }
          mesg.respondSync("created");
        } else {
          mesg.respondSync(null, {
            headers: { error: `unknown command ${request.cmd}`, code: 404 },
          });
        }
      } catch (err) {
        mesg.respondSync(null, {
          headers: { error: `${err}`, code: err.code },
        });
      }
    });
  });

  return server;
}

async function getAll({ stream, mesg, request, messagesThresh }) {
  let seq = 0;
  const respond = (error?, messages?: StoredMessage[]) => {
    mesg.respondSync(messages, { headers: { error, seq, code: error?.code } });
    seq += 1;
  };

  try {
    const messages: StoredMessage[] = [];
    let size = 0;
    for (const message of stream.getAll({
      start_seq: request.start_seq,
      end_seq: request.end_seq,
    })) {
      messages.push(message);
      size += message.raw.length;
      if (size >= messagesThresh) {
        respond(undefined, messages);
        messages.length = 0;
        size = 0;
      }
    }

    if (messages.length > 0) {
      respond(undefined, messages);
    }
    // successful finish
    respond();
  } catch (err) {
    respond(`${err}`);
  }
}

function startChangefeed({ socket, stream, messagesThresh }) {
  logger.debug("startChangefeed", { subject: socket.subject });
  // this seq here has nothing to do with the seq of the StoredMessage!
  let seq = 0;
  const respond = (error?, messages?: StoredMessage[]) => {
    if (socket.state == "closed") {
      return;
    }
    //logger.debug("changefeed: writing messages to socket", { seq, messages });
    socket.write(messages, { headers: { error, seq } });
    seq += 1;
  };

  const unsentMessages: StoredMessage[] = [];
  const sendAllUnsentMessages = throttle(
    () => {
      while (socket.state != "closed" && unsentMessages.length > 0) {
        const messages: StoredMessage[] = [];
        let size = 0;
        while (unsentMessages.length > 0 && socket.state != "closed") {
          const message = unsentMessages.shift();
          // e.g. op:'delete' messages have length 0 and no raw field
          size += message?.raw?.length ?? 0;
          messages.push(message!);
          if (size >= messagesThresh) {
            respond(undefined, messages);
            size = 0;
            messages.length = 0;
          }
        }
        if (messages.length > 0) {
          respond(undefined, messages);
        }
      }
    },
    SEND_THROTTLE,
    { leading: true, trailing: true },
  );

  stream.on("change", (message) => {
    if (socket.state == "closed") {
      return;
    }
    //console.log("stream change event", message);
    // logger.debug("changefeed got message", message, socket.state);
    unsentMessages.push(message);
    sendAllUnsentMessages();
  });
}
