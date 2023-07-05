/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { BlobStoreDisk } from "./disk";
import { BlobStoreSqlite } from "./sqlite";
import { blobstore } from "@cocalc/backend/data";
import Logger from "@cocalc/backend/logger";

const winston = Logger("jupyter-blobs:get");

// TODO: are these the only base64 encoded types that jupyter kernels return?
export const BASE64_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "base64",
] as const;

let blob_store_sqlite: BlobStoreSqlite | undefined = undefined;
let blob_store_disk: BlobStoreDisk | undefined = undefined;

export function get_blob_store_sync():
  | BlobStoreSqlite
  | BlobStoreDisk
  | undefined {
  switch (blobstore as string) {
    case "sqlite":
      return blob_store_sqlite;
    case "disk":
      return blob_store_disk;
    default:
      throw Error(`unknown blobstore type ${blobstore}`);
  }
}

export async function get_blob_store() {
  winston.info(`blobstore type: ${blobstore}`);
  if (blobstore === "sqlite") {
    if (blob_store_sqlite != null) return blob_store_sqlite;
    blob_store_sqlite = new BlobStoreSqlite();
    return blob_store_sqlite;
  } else if (blobstore === "disk") {
    if (blob_store_disk != null) return blob_store_disk;
    const disk = new BlobStoreDisk();
    await disk.init();
    blob_store_disk = disk;
    return blob_store_disk;
  } else {
    const msg = `Unknown blobstore type: ${blobstore}`;
    winston.error(msg);
    throw new Error(msg);
  }
}
