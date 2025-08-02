/*
Directory Listing

Tests in packages/backend/conat/files/test/listing.test.ts


*/

import { EventEmitter } from "events";
import { join } from "path";
import { type FilesystemClient } from "./fs";
import { EventIterator } from "@cocalc/util/event-iterator";

export type FileTypeLabel = "f" | "d" | "l" | "b" | "c" | "s" | "p";

export const typeDescription = {
  f: "regular file",
  d: "directory",
  l: "symlink",
  b: "block device",
  c: "character device",
  s: "socket",
  p: "fifo",
};

interface FileData {
  // last modification time as time since epoch in **milliseconds** (as is usual for javascript)
  mtime: number;
  size: number;
  // isDir = mainly for backward compat:
  isDir?: boolean;
  // issymlink = mainly for backward compat:
  isSymLink?: boolean;
  linkTarget?: string;
  // see typeDescription above.
  type?: FileTypeLabel;
}

export type Files = { [name: string]: FileData };

interface Options {
  path: string;
  fs: FilesystemClient;
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
    this.removeAllListeners();
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
      const stats = await this.opts.fs.lstat(join(this.opts.path, filename));
      if (this.files == null) {
        return;
      }
      const data: FileData = {
        mtime: stats.mtimeMs,
        size: stats.size,
        type: stats.type,
      };
      if (stats.isSymbolicLink()) {
        // resolve target.
        data.linkTarget = await this.opts.fs.readlink(
          join(this.opts.path, filename),
        );
        data.isSymLink = true;
      }
      if (stats.isDirectory()) {
        data.isDir = true;
      }
      this.files[filename] = data;
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
  fs: FilesystemClient,
  path: string,
): Promise<{ files: Files; truncated: boolean }> {
  const { stdout, truncated } = await fs.find(
    path,
    "%f\\0%T@\\0%s\\0%y\\0%l\n",
  );
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
      files[name] = { mtime, size, type: v[3] as FileTypeLabel };
      if (v[3] == "l") {
        files[name].isSymLink = true;
      }
      if (v[3] == "d") {
        files[name].isDir = true;
      }
      if (v[4]) {
        files[name].linkTarget = v[4];
      }
    } catch {}
  }
  return { files, truncated };
}
