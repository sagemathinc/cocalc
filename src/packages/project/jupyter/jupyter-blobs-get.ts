/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";

import initProgram from "@cocalc/project/init-program";
import { get_ProjectStatusServer } from "@cocalc/project/project-status/server";
import { BlobStoreDisk } from "./jupyter-blobs-disk";
import { BlobStoreSqlite } from "./jupyter-blobs-sqlite";

import Logger from "@cocalc/backend/logger";
const winston = Logger("jupyter-blobs:get");

// TODO: are these the only base64 encoded types that jupyter kernels return?
export const BASE64_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "base64",
] as const;

// don't import "options", because when I did that, it wasn't initialized yet. This makes sure you get the actual data.
const BLOBSTORE = initProgram().blobstore;

let blob_store_sqlite: BlobStoreSqlite | undefined = undefined;
let blob_store_disk: BlobStoreDisk | undefined = undefined;

export function get_blob_store_sync():
  | BlobStoreSqlite
  | BlobStoreDisk
  | undefined {
  switch (BLOBSTORE) {
    case "sqlite":
      return blob_store_sqlite;
    case "disk":
      return blob_store_disk;
    default:
      throw Error(`unknown blobstore type ${BLOBSTORE}`);
  }
}

export async function get_blob_store() {
  winston.info(`blobstore type: ${BLOBSTORE}`);

  while (true) {
    if (BLOBSTORE === "sqlite") {
      if (blob_store_sqlite != null) return blob_store_sqlite;
      try {
        blob_store_sqlite = new BlobStoreSqlite();
        get_ProjectStatusServer().clearComponentAlert("BlobStore");
        return blob_store_sqlite;
      } catch (err) {
        get_ProjectStatusServer().setComponentAlert("BlobStore");
        winston.warn(`unable to instantiate BlobStore -- ${err}`);
      }
    } else if (BLOBSTORE === "disk") {
      if (blob_store_disk != null) return blob_store_disk;
      try {
        const disk = new BlobStoreDisk();
        await disk.init();
        get_ProjectStatusServer().clearComponentAlert("BlobStore");
        blob_store_disk = disk;
        return blob_store_disk;
      } catch (err) {
        get_ProjectStatusServer().setComponentAlert("BlobStore");
        winston.warn(`unable to instantiate BlobStore -- ${err}`);
      }
    } else {
      const msg = `Unknown blobstore type: ${BLOBSTORE}`;
      winston.error(msg);
      throw new Error(msg);
    }
    winston.warn(`unable to instantiate BlobStore -- retrying in 5 seconds`);
    await delay(5000);
  }
}
