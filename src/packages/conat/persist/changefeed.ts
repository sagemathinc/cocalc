/*
CONAT_SERVER=http://localhost:3000 node

// the server

require('@cocalc/backend/conat/persist'); client = await require('@cocalc/backend/conat').conat(); s = require('@cocalc/conat/persist/changefeed').server({client}); 0;



// a client

client = await require('@cocalc/backend/conat').conat(); stream = require('@cocalc/conat/persist/changefeed').stream({client, user:{project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f'}, storage:{path:'projects/3fa218e5-7196-4020-8b30-e2127847cc4f/a.txt'}});

s = await stream.getAll()

await stream.set({messageData:client.message(123)})

*/

import { type Client, type MessageData } from "@cocalc/conat/core/client";
import { type SubjectSocket } from "@cocalc/conat/core/subject-socket";
export { type SubjectSocket };
//import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";
import type {
  Options as Storage,
  Message as StoredMessage,
  PersistentStream,
} from "./storage";
import { getStream, persistSubject, type User, SERVICE } from "./server";
import { is_array } from "@cocalc/util/misc";

const logger = getLogger("persist");

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


export function server({
  client,
  messagesThresh = DEFAULT_MESSAGES_THRESH,
}: {
  client: Client;
  messagesThresh?: number;
}) {
  logger.debug("server: creating...");
  const subject = `${SERVICE}.*`;
  const server = client.socket.listen(subject);
  logger.debug("server: listening in on ", { subject });

  server.on("connection", (socket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });
    socket.on("data", (data) => {
      logger.debug("server: got data ", data);
      getAll({ socket, request: data, messagesThresh });
    });
    socket.on("request", async (mesg) => {
      const request = mesg.headers;
      logger.debug("got request", request);

      let stream: undefined | PersistentStream = undefined;
      const respond = (...args) => {
        stream?.close();
        mesg.respond(...args);
      };

      try {
        stream = await getStream({
          subject: mesg.subject,
          storage: request.storage,
        });

        if (request.cmd == "set") {
          respond(
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
        } else if (request.cmd == "delete") {
          respond(stream.delete(request));
        } else if (request.cmd == "config") {
          respond(stream.config(request.config));
        } else if (request.cmd == "get") {
          const resp = stream.get({ key: request.key, seq: request.seq });
          //console.log("got resp = ", resp);
          if (resp == null) {
            respond(null);
          } else {
            const { raw, encoding, headers, seq, time, key } = resp;
            respond(null, {
              raw,
              encoding,
              headers: { ...headers, seq, time, key },
            });
          }
        } else if (request.cmd == "keys") {
          const resp = stream.keys();
          respond(resp);
        } else if (request.cmd == "sqlite") {
          if (!ENABLE_SQLITE_GENERAL_QUERIES) {
            throw Error("sqlite command not currently supported");
          }
          const resp = stream.sqlite(request.statement, request.params);
          respond(resp);
        } else {
          respond(null, {
            headers: { error: `unknown command ${request.cmd}`, code: 404 },
          });
        }
      } catch (err) {
        respond(null, { headers: { error: `${err}`, code: err.code } });
      }
    });
  });

  return server;
}

async function getAll({ socket, request, messagesThresh }) {
  logger.debug("getAll", { subject: socket.subject, request });
  let seq = 0;

  const respond = (error, content?: { state: "watch" } | StoredMessage[]) => {
    if (socket.state == "closed") {
      end();
    }
    if (!error && is_array(content)) {
      // console.log("content = ", content);
      // StoredMessage
      const messages = content as StoredMessage[];
      socket.write(messages, { headers: { seq } });
    } else {
      socket.write(null, { headers: { error, seq, content } });
    }
    if (error) {
      end();
      return;
    }

    seq += 1;
  };

  let done = false;
  let stream: PersistentStream | undefined = undefined;
  const end = () => {
    if (done) {
      return;
    }
    done = true;
    stream?.close();
    socket.close();
  };

  try {
    stream = await getStream({
      subject: socket.subject,
      storage: request.storage,
    });

    // send the current data
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

    if (request.end_seq) {
      end();
      return;
    }

    // send state change message
    respond(undefined, { state: "watch" });

    const unsentMessages: StoredMessage[] = [];
    const sendAllUnsentMessages = () => {
      while (!done && unsentMessages.length > 0) {
        if (done) return;
        const messages: StoredMessage[] = [];
        let size = 0;
        while (unsentMessages.length > 0 && !done) {
          const message = unsentMessages.shift();
          // e.g. op:'delete' messages have length 0 and no raw field
          size += message?.raw?.length ?? 0;
          messages.push(message!);
          if (size >= messagesThresh) {
            respond(undefined, messages);
            if (done) return;
            size = 0;
            messages.length = 0;
          }
        }
        if (done) return;
        if (messages.length > 0) {
          respond(undefined, messages);
        }
      }
    };

    stream.on("change", (message) => {
      if (done) {
        return;
      }
      //console.log("stream change event", message);
      unsentMessages.push(message);
      sendAllUnsentMessages();
    });
  } catch (err) {
    if (!done) {
      respond(`${err}`);
    }
  }
}

import { EventIterator } from "@cocalc/util/event-iterator";

class PersistStreamClient {
  private socket: SubjectSocket;
  constructor(
    private client: Client,
    private storage: Storage,
    private user: User,
  ) {
    this.socket = this.client.socket.connect(persistSubject(this.user), {
      reconnection: false,
    });
  }

  getAll = ({
    start_seq,
    end_seq,
  }: {
    start_seq?: number;
    end_seq?: number;
  } = {}) => {
    const changefeed = new EventIterator<any>(this.socket, "data");
    this.socket.write({ start_seq, end_seq, storage: this.storage });
    return changefeed;
  };

  set = async ({
    key,
    ttl,
    previousSeq,
    msgID,
    messageData,
    timeout,
  }: {
    messageData: MessageData;
    key?: string;
    ttl?: number;
    previousSeq?: number;
    msgID?: string;
    timeout?: number;
  }): Promise<{ seq: number; time: number }> => {
    const reply = await this.socket.request(null, {
      raw: messageData.raw,
      encoding: messageData.encoding,
      headers: {
        headers: messageData.headers,
        cmd: "set",
        key,
        ttl,
        previousSeq,
        msgID,
        storage: this.storage,
      },
      timeout,
    });
    return reply.data;
  };
}

export function stream({
  client,
  user,
  storage,
}: {
  client: Client;
  // who is accessing persistent storage
  user: User;
  // what storage they are accessing
  storage: Storage;
}) {
  return new PersistStreamClient(client, storage, user);
}
