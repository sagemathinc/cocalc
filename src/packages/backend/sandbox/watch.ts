import { readFile } from "node:fs/promises";
import { watch as chokidarWatch } from "chokidar";
import { EventIterator } from "@cocalc/util/event-iterator";
import { type WatchOptions, type ChangeEvent } from "@cocalc/conat/files/watch";
import { EventEmitter } from "events";
import { make_patch } from "@cocalc/util/patch";
import LRU from "lru-cache";

export { type WatchOptions };
export type WatchIterator = EventIterator<ChangeEvent>;

export default function watch(
  path: string,
  options: WatchOptions,
  lastOnDisk: LRU<string, string>,
): WatchIterator {
  console.log("watch", { path, options });
  const watcher = new Watcher(path, options, lastOnDisk);

  const iter = new EventIterator(watcher, "change", {
    maxQueue: options.maxQueue ?? 2048,
    overflow: options.overflow,
    map: (args) => args[0],
    onEnd: () => {
      //console.log("close ", path);
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
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });
    // console.log("creating watcher of ", path);

    this.watcher.on("all", this.handle);
  }

  handle = async (event, path, stat) => {
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
      console.log(path, "patch option not set");
      this.emit("change", x);
      return;
    }

    const last = this.lastOnDisk.get(path);
    if (last === undefined) {
      console.log(path, "lastOnDisk not set");
      return x;
    }
    let cur;
    try {
      cur = await readFile(path, "utf8");
    } catch (err) {
      console.log(path, "read error", err);
      this.emit("change", x);
      return;
    }
    if (last == cur) {
      console.log(path, "no change");
      // no change
      return;
    }
    x.patch = make_patch(last, cur);
      console.log(path, "change", x.patch);
    this.lastOnDisk.set(path, cur);
    this.emit("change", x);
  };

  close() {
    this.watcher.close();
    this.emit("close");
  }
}
