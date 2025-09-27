import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export type Message = Record<string, unknown>;
export type Handler = (msg: Message, filePath: string) => Promise<void> | void;

function isJsonFile(name: string): boolean {
  return name.endsWith(".json") && !name.startsWith(".");
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { mode: 0o700, recursive: true });
  // Best-effort chmod (in case dir already existed):
  try {
    await fsp.chmod(dir, 0o700);
  } catch {}
}

export class SpoolWatcher {
  private readonly dir: string;
  private readonly handle: Handler;
  private watching = false;
  private watcher?: fs.FSWatcher;
  private scanScheduled = false;
  private inFlight = new Set<string>(); // basenames
  private closed = false;

  constructor(dir: string, handle: Handler) {
    this.dir = path.resolve(dir);
    this.handle = handle;
  }

  async start(): Promise<void> {
    await ensureDir(this.dir);
    this.watching = true;

    // Process any preexisting messages first.
    await this.scanAndQueue();

    // Start watch; always rescan on any event (robustness over cleverness).
    this.watcher = fs.watch(this.dir, { persistent: true }, () => {
      if (!this.scanScheduled) {
        this.scanScheduled = true;
        // microtask-ish debounce to coalesce bursts
        setTimeout(() => {
          this.scanScheduled = false;
          void this.scanAndQueue();
        }, 10);
      }
    });

    this.watcher.on("error", () => {
      // If the dir vanished temporarily, try to recreate and resume.
      // Otherwise, surface/log as needed for your server.
      // You can plug your logger here.
      // console.error("Spool watcher error:", err);
      void this.recover();
    });

    this.watcher.on("close", () => {
      if (!this.closed) {
        // Unexpected close; try to restart
        void this.recover();
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.watching = false;
    try {
      this.watcher?.close();
    } catch {}
    this.inFlight.clear();
  }

  // --- internals ---

  private async recover() {
    if (this.closed) return;
    try {
      await ensureDir(this.dir);
      await this.scanAndQueue();
      // restart watcher
      try {
        this.watcher?.close();
      } catch {}
      this.watcher = fs.watch(this.dir, { persistent: true }, () => {
        if (!this.scanScheduled) {
          this.scanScheduled = true;
          setTimeout(() => {
            this.scanScheduled = false;
            void this.scanAndQueue();
          }, 10);
        }
      });
    } catch {
      // Delay and retry
      setTimeout(() => void this.recover(), 250);
    }
  }

  private async scanAndQueue(): Promise<void> {
    if (!this.watching) return;
    let names: string[];
    try {
      names = await fsp.readdir(this.dir);
    } catch {
      // dir may not exist momentarily
      return;
    }

    // Filter valid message files and sort oldest-first (by filename).
    const files = names
      .filter(isJsonFile)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const base of files) {
      if (this.inFlight.has(base)) continue;
      this.inFlight.add(base);
      // process sequentially to keep ordering predictable per directory scan
      // (if you want concurrency, you can remove await, but keep inFlight logic)
      await this.processOne(base).catch(() => {
        /* handled inside */
      });
      this.inFlight.delete(base);
    }
  }

  private async processOne(base: string): Promise<void> {
    const full = path.join(this.dir, base);

    // LSTAT to guard against symlinks/devices.
    let st: fs.Stats;
    try {
      st = await fsp.lstat(full);
    } catch (e: any) {
      // vanished between readdir and now
      if (e?.code === "ENOENT") return;
      throw e;
    }
    if (!st.isFile()) {
      // Ignore non-regular (and symlinks)
      await this.safeUnlink(full);
      return;
    }

    // Read file contents. Writer should have used atomic rename, so content is complete.
    let data: string;
    try {
      data = await fsp.readFile(full, "utf8");
    } catch (e: any) {
      if (e?.code === "ENOENT") return; // raced with unlink
      // transient read error; try once more shortly
      await this.sleep(10);
      try {
        data = await fsp.readFile(full, "utf8");
      } catch {
        await this.safeUnlink(full);
        return;
      }
    }

    // Parse NDJSON: one JSON object per line.
    const lines = data
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Message;
        await this.handle(msg, full);
      } catch (e) {
        // Move bad file aside or just skip the bad line; here we skip the line.
        // If you want, rename to .bad for postmortem:
        // await this.safeRename(full, full + ".bad");
      }
    }

    // Remove after successful processing to avoid replay.
    await this.safeUnlink(full);
  }

  private async safeUnlink(p: string) {
    try {
      await fsp.unlink(p);
    } catch {}
  }

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }
}
