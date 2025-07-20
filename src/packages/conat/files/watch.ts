/*
Remotely proxying a fs.watch AsyncIterator over a Conat Socket.
*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import { EventIterator } from "@cocalc/util/event-iterator";

import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:files:watch");

// (path:string, options:WatchOptions) => AsyncIterator
type AsyncWatchFunction = any;

// see https://nodejs.org/docs/latest/api/fs.html#fspromiseswatchfilename-options
export interface WatchOptions {
  persistent?: boolean;
  recursive?: boolean;
  encoding?: string;
  signal?: AbortSignal;
  maxQueue?: number;
  overflow?: "ignore" | "throw";

  // if more than one client is actively watching the same path and has unique set, only one
  // will receive updates.  Also, if there are multiple clients with unique set, the options
  // of all but the first are ignored.
  unique?: boolean;
}

export function watchServer({
  client,
  subject,
  watch,
}: {
  client: ConatClient;
  subject: string;
  watch: AsyncWatchFunction;
}) {
  const server: ConatSocketServer = client.socket.listen(subject);
  logger.debug("server: listening on ", { subject });

  //const unique;
  async function handleUnique({ mesg, socket, path, options }) {
    const w = await watch(path, options);
    socket.once("closed", () => {
      w.close();
    });
    await mesg.respond();
    for await (const event of w) {
      socket.write(event);
    }
  }

  async function handleNonUnique({ mesg, socket, path, options }) {
    const w = await watch(path, options);
    socket.once("closed", () => {
      w.close();
    });
    await mesg.respond();
    for await (const event of w) {
      socket.write(event);
    }
  }

  server.on("connection", (socket: ServerSocket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });
    let initialized = false;
    socket.on("request", async (mesg) => {
      try {
        if (initialized) {
          throw Error("already initialized");
        }
        initialized = true;
        const { path, options } = mesg.data;
        logger.debug("got request", { path, options });
        if (options?.unique) {
          await handleUnique({ mesg, socket, path, options });
        } else {
          await handleNonUnique({ mesg, socket, path, options });
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

export async function watchClient({
  client,
  subject,
  path,
  options,
}: {
  client: ConatClient;
  subject: string;
  path: string;
  options?: WatchOptions;
}) {
  const socket = await client.socket.connect(subject);
  const iter = new EventIterator(socket, "data", {
    map: (args) => args[0],
    onEnd: () => {
      socket.close();
    },
  });
  socket.on("closed", () => {
    iter.end();
  });
  // tell it what to watch
  await socket.request({ path, options });
  return iter;
}
