/*
Directory Listing

Tests in packages/backend/conat/files/test/listing.test.ts
*/

import { EventEmitter } from "events";
import { join } from "path";
import { type Filesystem } from "./fs";
import { EventIterator } from "@cocalc/util/event-iterator";

interface FileData {
  mtime: number;
  size: number;
}

export type Files = { [name: string]: FileData };

interface Options {
  path: string;
  fs: Filesystem;
}

export default async function listing(opts: Options): Promise<Listing> {
  const listing = new Listing(opts);
  await listing.init();
  return listing;
}

export class Listing extends EventEmitter {
  public files?: Files = {};
  public truncated?: boolean;
  private watch?;
  private iters: EventIterator<FileData & { name: string }>[] = [];
  constructor(public readonly opts: Options) {
    super();
  }

  iter = () => {
    const iter = new EventIterator(this, "change", {
      map: (args) => {
        return { name: args[0], ...args[1] };
      },
    });
    this.iters.push(iter);
    return iter;
  };

  close = () => {
    this.emit("closed");
    this.iters.map((iter) => iter.end());
    this.iters.length = 0;
    this.watch?.close();
    delete this.files;
    delete this.watch;
  };

  init = async () => {
    const { fs, path } = this.opts;
    this.watch = await fs.watch(path);
    const { files, truncated } = await getListing(fs, path);
    this.files = files;
    this.truncated = truncated;
    this.emit("ready");
    this.handleUpdates();
  };

  private handleUpdates = async () => {
    for await (const { filename } of this.watch) {
      if (this.files == null) {
        return;
      }
      this.update(filename);
    }
  };

  private update = async (filename: string) => {
    if (this.files == null) {
      // closed or not initialized yet
      return;
    }
    try {
      const stats = await this.opts.fs.stat(join(this.opts.path, filename));
      if (this.files == null) {
        return;
      }
      this.files[filename] = { mtime: stats.mtimeMs, size: stats.size };
    } catch (err) {
      if (this.files == null) {
        return;
      }
      if (err.code == "ENOENT") {
        // file deleted
        delete this.files[filename];
      } else {
        //if (!process.env.COCALC_TEST_MODE) {
        console.warn("WARNING:", err);
        // TODO: some other error -- e.g., network down or permissions, so we don't know anything.
        // Should we retry (?).
        //}
        return;
      }
    }
    this.emit("change", filename, this.files[filename]);
  };
}

async function getListing(
  fs: Filesystem,
  path: string,
): Promise<{ files: Files; truncated: boolean }> {
  const { stdout, truncated } = await fs.find(path, "%f\\0%T@\\0%s\n");
  const buf = Buffer.from(stdout);
  const files: Files = {};
  // todo -- what about non-utf8...?

  const s = buf.toString().trim();
  if (!s) {
    return { files, truncated };
  }
  for (const line of s.split("\n")) {
    try {
      const v = line.split("\0");
      const name = v[0];
      const mtime = parseFloat(v[1]) * 1000;
      const size = parseInt(v[2]);
      files[name] = { mtime, size };
    } catch {}
  }
  return { files, truncated };
}
