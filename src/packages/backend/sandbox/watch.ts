import { readFile } from "node:fs/promises";
import { watch as chokidarWatch } from "chokidar";
import { EventIterator } from "@cocalc/util/event-iterator";
import { type WatchOptions, type ChangeEvent } from "@cocalc/conat/files/watch";
import { EventEmitter } from "events";
import { make_patch } from "@cocalc/util/patch";
import LRU from "lru-cache";

export { type WatchOptions };
export type WatchIterator = EventIterator<ChangeEvent>;

const log = (...args) => {}; //console.log(...args);

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
      alwaysStat: options.stat ?? false,
      atomic: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 70,
      },
    });
    // log("creating watcher of ", path);

    this.watcher.on("all", async (...args) => {
      const change = await this.handle(...args);
      if (change !== undefined) {
        this.emit("change", change);
      }
    });
  }

  handle = async (event, path, stat): Promise<undefined | ChangeEvent> => {
    const filename = path.slice(this.path.length + 1);
    const x: ChangeEvent = { event, filename };
    if (this.options.stat) {
      x.stat = stat;
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
    x.patch = make_patch(last, cur);
    log(path, "change", x.patch);
    this.lastOnDisk.set(path, cur);
    return x;
  };

  close() {
    this.watcher.close();
    this.emit("close");
  }
}
