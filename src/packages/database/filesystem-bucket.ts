/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as fs from "fs";

import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/database";

const { defaults } = misc;
const required = defaults.required;

type BucketOptions = {
  name: string;
};

type WriteOptions = {
  name: string;
  content: Buffer | string;
  cb: CB;
};

type ReadOptions = {
  name: string;
  cb: CB<Buffer>;
};

type DeleteOptions = {
  name: string;
  cb?: CB;
};

export function filesystem_bucket(opts: BucketOptions): FilesystemBucket {
  const normalized = defaults(opts, { name: required }) as BucketOptions;
  if (!normalized.name) {
    throw Error("bucket name must be specified");
  }
  return new FilesystemBucket(normalized.name);
}

class FilesystemBucket {
  constructor(private path: string) {}

  blob_path(name: string): string {
    return `${this.path}/${name}`;
  }

  write(opts: WriteOptions): void {
    const normalized = defaults(opts, {
      name: required,
      content: required,
      cb: required,
    }) as WriteOptions;
    fs.writeFile(
      this.blob_path(normalized.name),
      normalized.content,
      normalized.cb,
    );
  }

  read(opts: ReadOptions): void {
    const normalized = defaults(opts, {
      name: required,
      cb: required,
    }) as ReadOptions;
    fs.readFile(this.blob_path(normalized.name), normalized.cb);
  }

  delete(opts: DeleteOptions): void {
    const normalized = defaults(opts, {
      name: required,
      cb: undefined,
    }) as DeleteOptions;
    fs.unlink(this.blob_path(normalized.name), (err) => normalized.cb?.(err));
  }
}
