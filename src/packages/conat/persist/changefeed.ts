/*
CONAT_SERVER=http://localhost:3000 node

// the server

require('@cocalc/backend/conat/persist'); client = await require('@cocalc/backend/conat').conat(); s = require('@cocalc/conat/persist/changefeed').persistChangefeedServer({client}); 0;



// a client

client = await require('@cocalc/backend/conat').conat(); cf = require('@cocalc/conat/persist/changefeed').changefeed({client, user:{project_id:'3fa218e5-7196-4020-8b30-e2127847cc4f'}, storage:{path:'projects/3fa218e5-7196-4020-8b30-e2127847cc4f/a.txt'}}); cf.on('data',(data,headers)=>console.log(JSON.stringify({data,headers}))); 0

*/

import { type Client } from "@cocalc/conat/core/client";
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

export function persistChangefeedServer({
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
    socket.on("data", (request) => {
      logger.debug("server: got request ", request);
      getAll({ socket, request, messagesThresh });
    });
  });

  return server;
}

//export type Connection = EventIterator<[error?]>;

export function changefeed({
  client,
  start_seq,
  end_seq,
  // who is accessing persistent storage
  user,
  // what storage they are accessing
  storage,
}: {
  client: Client;
  start_seq?: number;
  end_seq?: number;
  user: User;
  storage: Storage;
}) {
  logger.debug("creating persist client", { user, storage });
  const socket = client.socket.connect(persistSubject(user), {
    reconnection: false,
  });
  socket.write({ start_seq, end_seq, storage });
  return socket;
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
