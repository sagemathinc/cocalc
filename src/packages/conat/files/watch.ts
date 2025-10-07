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
import { type CompressedPatch } from "@cocalc/util/patch";
import { Stats } from "./fs";

const SERVER_KEEP_ALIVE = 15_000;
const SERVER_KEEP_ALIVE_TIMEOUT = 5_000;

const logger = getLogger("conat:files:watch");

// (path:string, options:WatchOptions) => AsyncIterator
type AsyncWatchFunction = any;

// This is NOT the nodejs watcher, but uses
//   https://github.com/paulmillr/chokidar
// though we do not allow customization of many options.
// It basically works like the fs watcher without any options,
// and for a path recursively watches to a depth of "0", i.e., watches
// for changes to files in that folder, but no subfolders.
export interface WatchOptions {
  maxQueue?: number;
  overflow?: "ignore" | "throw";
  signal?;

  // if more than one client is actively watching the same path and has unique set,
  // all but one should receive the extra field ignore:true in the update.
  unique?: boolean;

  // if true, watcher will close if the path being watched is unlinked.
  closeOnUnlink?: boolean;

  stats?: boolean;

  patch?: boolean;
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
  const server: ConatSocketServer = client.socket.listen(subject, {
    keepAlive: SERVER_KEEP_ALIVE,
    keepAliveTimeout: SERVER_KEEP_ALIVE_TIMEOUT,
  });
  logger.debug("server: listening on ", { subject });

  const unique: { [path: string]: ServerSocket[] } = {};
  const ignores: { [path: string]: { ignoreUntil: number }[] } = {};
  async function handleUnique({ mesg, socket, path, options, ignore }) {
    let w: any = undefined;

    socket.once("closed", () => {
      // when this socket closes, remove it from recipient list
      unique[path] = unique[path]?.filter((x) => x.id != socket.id);
      if (unique[path] != null && unique[path].length == 0) {
        // nobody listening
        w?.close();
        w = undefined;
        delete unique[path];
        delete ignores[path];
      }
    });

    if (unique[path] == null) {
      // set it up
      unique[path] = [socket];
      ignores[path] = [ignore];
      w = await watch(path, options);
      await mesg.respond();
      for await (const event of w) {
        const now = Date.now();
        let ignore = false;
        for (const { ignoreUntil } of ignores[path]) {
          if (ignoreUntil > now) {
            // every client is told to ignore this change, i.e., not load based on it happening
            ignore = true;
            break;
          }
        }
        for (const s of unique[path]) {
          if (s.state == "ready") {
            if (ignore) {
              // do not send the change event at all
              continue;
              // s.write({ ...event, ignore: true });
            } else {
              // this one processes the event:
              s.write(event);
              // the rest will not receive it.
              ignore = true;
            }
          }
        }
      }
    } else {
      unique[path].push(socket);
      ignores[path].push(ignore);
      await mesg.respond();
    }
  }

  async function handleNonUnique({ mesg, socket, path, options, ignore }) {
    const w = await watch(path, options);
    socket.once("closed", () => {
      w.close();
    });
    await mesg.respond();
    for await (const event of w) {
      if (ignore.ignoreUntil >= Date.now()) {
        continue;
      }
      socket.write(event);
    }
  }

  server.on("connection", (socket: ServerSocket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });
    let initialized = false;
    const ignore = { ignoreUntil: 0 };
    socket.on("request", async (mesg) => {
      const data = mesg.data;
      if (data.ignore != null) {
        ignore.ignoreUntil = data.ignore > 0 ? Date.now() + data.ignore : 0;
        await mesg.respond(null, { noThrow: true });
        return;
      }
      try {
        if (initialized) {
          throw Error("already initialized");
        }
        initialized = true;
        const { path, options } = data;
        logger.debug("got request", { path, options });
        if (options?.unique) {
          await handleUnique({ mesg, socket, path, options, ignore });
        } else {
          await handleNonUnique({ mesg, socket, path, options, ignore });
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

export type WatchIterator = EventIterator<ChangeEvent> & {
  ignore?: (ignore: number) => Promise<void>;
};

export interface ChangeEvent {
  event: "add" | "addDir" | "change" | "unlink" | "unlinkDir";
  filename: string;
  ignore?: boolean;
  patch?: CompressedPatch;
  patchSeq?: number;
  stats?;
}

export async function watchClient({
  client,
  subject,
  path,
  options,
  fs,
}: {
  client: ConatClient;
  subject: string;
  path: string;
  options?: WatchOptions;
  fs?;
}): Promise<WatchIterator> {
  const socket = client.socket.connect(subject);
  let constants = options?.stats ? await fs?.constants() : undefined;
  const iter = new EventIterator<ChangeEvent & { stats?: Stats }>(
    socket,
    "data",
    {
      map: (args) => {
        if (args[0].stats && constants !== undefined) {
          const s = args[0].stats;
          const stats = new Stats(constants);
          for (const k in s) {
            stats[k] = s[k];
          }
          args[0].stats = stats;
        }
        return args[0];
      },
      onEnd: () => {
        socket.close();
      },
    },
  );
  socket.on("closed", () => {
    console.log("watchClient", path, "CLOSED!");
    iter.end();
    delete iter2.ignore;
  });
  // tell it what to watch
  await socket.request({
    path,
    options,
  });
  const iter2 = iter as WatchIterator;

  // ignore events for ignore ms.
  iter2.ignore = async (ignore: number) => {
    await socket.request({ ignore });
  };

  return iter2;
}
