/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { promises as fs } from "fs";
import type { CB } from "@cocalc/util/types/database";

type BucketOptions = {
  name: string;
};

type WriteOptions = {
  name: string;
  content: Buffer | string;
  cb?: CB;
};

type ReadOptions = {
  name: string;
  cb?: CB<Buffer>;
};

type DeleteOptions = {
  name: string;
  cb?: CB;
};

export interface BlobStore {
  blob_path(name: string): string;
  write(opts: WriteOptions): Promise<void>;
  read(opts: ReadOptions): Promise<Buffer>;
  delete(opts: DeleteOptions): Promise<void>;
}

export function filesystem_bucket(opts: BucketOptions): BlobStore {
  const { name } = opts;
  if (!name) {
    throw Error("bucket name must be specified");
  }
  return new FilesystemBucket(name);
}

class FilesystemBucket implements BlobStore {
  constructor(private path: string) {}

  blob_path(name: string): string {
    return `${this.path}/${name}`;
  }

  async write(opts: WriteOptions): Promise<void> {
    const { name, content, cb } = opts;
    try {
      await fs.writeFile(this.blob_path(name), content);
      cb?.();
    } catch (err) {
      cb?.(err);
      if (!cb) {
        throw err;
      }
    }
  }

  async read(opts: ReadOptions): Promise<Buffer> {
    const { name, cb } = opts;
    try {
      const data = await fs.readFile(this.blob_path(name));
      cb?.(undefined, data);
      return data;
    } catch (err) {
      cb?.(err);
      if (!cb) {
        throw err;
      }
      return Buffer.alloc(0);
    }
  }

  async delete(opts: DeleteOptions): Promise<void> {
    const { name, cb } = opts;
    try {
      await fs.unlink(this.blob_path(name));
      cb?.();
    } catch (err) {
      cb?.(err);
      if (!cb) {
        throw err;
      }
    }
  }
}
