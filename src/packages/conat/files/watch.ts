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
type WatchOptions = any;

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

  server.on("connection", (socket: ServerSocket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });
    let w: undefined | ReturnType<typeof watch> = undefined;
    socket.on("closed", () => {
      w?.close();
      w = undefined;
    });

    socket.on("request", async (mesg) => {
      try {
        const { path, options } = mesg.data;
        logger.debug("got request", { path, options });
        if (w != null) {
          w.close();
          w = undefined;
        }
        w = await watch(path, options);
        await mesg.respond();
        for await (const event of w) {
          socket.write(event);
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
  options: WatchOptions;
}) {
  const socket = await client.socket.connect(subject);
  const iter = new EventIterator(socket, "data", {
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
