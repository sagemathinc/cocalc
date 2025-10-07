import { readFile } from "node:fs/promises";
import { watch as chokidarWatch } from "chokidar";
import { EventIterator } from "@cocalc/util/event-iterator";
import { type WatchOptions, type ChangeEvent } from "@cocalc/conat/files/watch";
import { EventEmitter } from "events";
import { make_patch } from "@cocalc/util/patch";
import LRU from "lru-cache";

export { type WatchOptions };
export type WatchIterator = EventIterator<ChangeEvent>;

// do NOT use patch for tracking file changes if the file exceeds
// this size.  The reason is mainly because computing diffs of
// large files on the server can take a long time!
const MAX_PATCH_FILE_SIZE = 1_000_000;

const log = (...args) => console.log(...args);
//const log = (..._args) => {};

export default function watch(
  path: string,
  options: WatchOptions,
  lastOnDisk: LRU<string, string>,
): WatchIterator {
  log("watch", { path, options });
  const watcher = new Watcher(path, options, lastOnDisk);

  const iter = new EventIterator(watcher, "change", {
    maxQueue: options.maxQueue ?? 2048,
    overflow: options.overflow,
    map: (args) => args[0],
    onEnd: () => {
      //log("close ", path);
      watcher.close();
    },
  });
  return iter;
}

class Watcher extends EventEmitter {
  private watcher: ReturnType<typeof chokidarWatch>;
  private ready: boolean = false;

  constructor(
    private path: string,
    private options: WatchOptions,
    private lastOnDisk: LRU<string, string>,
  ) {
    super();
    this.watcher = chokidarWatch(path, {
      depth: 0,
      ignoreInitial: true,
      followSymlinks: false,
      alwaysStat: options.stats ?? false,
      atomic: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 90,
      },
    });
    log("creating watcher ", path, options);

    this.watcher.once("ready", () => {
      this.ready = true;
    });
    this.watcher.on("all", async (...args) => {
      const change = await this.handle(...args);
      if (change !== undefined) {
        this.emit("change", change);
      }
    });
  }

  handle = async (event, path, stats): Promise<undefined | ChangeEvent> => {
    if (!this.ready) {
      return;
    }
    let filename = path.slice(this.path.length);
    if (filename.startsWith("/")) {
      filename = filename.slice(1);
    }
    const x: ChangeEvent = { event, filename };
    if (this.options.stats) {
      x.stats = stats;
    }
    if (this.options.closeOnUnlink && path == this.path) {
      this.emit("change", x);
      this.close();
      return;
    }
    if (!this.options.patch) {
      log(path, "patch option not set", this.options);
      return x;
    }

    const last = this.lastOnDisk.get(path);
    if (last === undefined) {
      log(path, "lastOnDisk not set");
      return x;
    }
    let cur;
    try {
      cur = await readFile(path, "utf8");
    } catch (err) {
      log(path, "read error", err);
      return x;
    }
    if (last == cur) {
      log(path, "no change");
      // no change
      return;
    }
    this.lastOnDisk.set(path, cur);
    if (
      cur.length >= MAX_PATCH_FILE_SIZE ||
      last.length >= MAX_PATCH_FILE_SIZE
    ) {
      // just inform that there is a change
      log(path, "patch -- file too big (cur)");
      return x;
    }
    // small enough to make a patch
    log(path, "making a patch with ", last.length, cur.length);
    const t = Date.now();
    x.patch = make_patch(last, cur);
    log(path, "made patch", Date.now() - t, x.patch);
    return x;
  };

  close() {
    this.watcher.close();
    this.emit("close");
    this.removeAllListeners();
    // @ts-ignore
    delete this.watcher;
    // @ts-ignore
    delete this.ready;
  }
}
