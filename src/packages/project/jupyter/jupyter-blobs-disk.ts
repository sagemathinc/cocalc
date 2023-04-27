/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

import Logger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { touch } from "@cocalc/backend/misc/touch";
import { sha1 } from "@cocalc/backend/sha1";
import { BlobStoreInterface } from "@cocalc/frontend/jupyter/project-interface";
import { days_ago } from "@cocalc/util/misc";
import { BASE64_TYPES } from "./jupyter-blobs-get";

const L = Logger("jupyter-blobs:disk").debug;

// the directory where files are stored. by default, in the home directory
// in ~/.cache/cocalc/blobs. The path can be overwritten by setting the
// environment variable JUPYTER_BLOBS_DB_DIR.

const BLOB_DIR = join(
  homedir(),
  process.env["JUPYTER_BLOBS_DB_DIR"] ?? ".cache/cocalc/blobs"
);

// read the integer from JUPYTER_BLOBS_DB_DIR_PRUNE_SIZE_MB, or default to 200
const PRUNE_SIZE_MB = envToInt("JUPYTER_BLOBSTORE_DISK_PRUNE_SIZE_MB", 200);
const PRUNE_ENTRIES = envToInt("JUPYTER_BLOBSTORE_DISK_PRUNE_ENTRIES", 1000);

// The JSON-serizalized and compressed structure we store per entry.
interface Data {
  ipynb?: string;
  type?: string;
  data?: string;
}

export class BlobStoreDisk implements BlobStoreInterface {
  private hashLength: number;
  private haveSavedMB: number = 0;

  constructor() {
    this.prune = reuseInFlight(this.prune.bind(this));
    this.hashLength = sha1("test").length;
  }

  public async init() {
    L(
      `initializing blob store in ${BLOB_DIR} with prune params: size=${PRUNE_SIZE_MB}MB and max entries=${PRUNE_ENTRIES}`
    );
    try {
      await mkdir(BLOB_DIR, { recursive: true });
      // call this.prune in 1 minute
      setTimeout(() => this.prune(), 60 * 1000);
      L(`successfully initialized blob store`);
    } catch (err) {
      L(`failed to initialize blob store: ${err}`);
      throw err;
    }
  }

  private async getAllFiles() {
    const files = await readdir(BLOB_DIR);
    return files.filter((file) => file.length === this.hashLength);
  }

  public async delete_all_blobs() {
    for (const file of await this.getAllFiles()) {
      // delete file
      const path = join(BLOB_DIR, file);
      await unlink(path);
    }
  }

  // NOTE: this is wrapped in a reuseInFlight, so it is only run once at a time
  private async prune(ageD = 100) {
    L(`prune ageD=${ageD}`);
    if (ageD < 3) {
      await this.delete_all_blobs();
      return;
    }

    const cutoff = days_ago(ageD);
    let totalSize = 0;
    let numFiles = 0;
    let deletedFiles = 0;
    for (const file of await this.getAllFiles()) {
      numFiles += 1;
      const path = join(BLOB_DIR, file);
      const stats = await stat(path);
      if (stats.mtime < cutoff) {
        await unlink(path);
        deletedFiles += 1;
      } else {
        // sum up to total size of files
        totalSize += stats.size;
        // to many entries? prune more recent files
        if (numFiles > PRUNE_ENTRIES) {
          L(`prune: too many files`);
          await this.prune(Math.floor(ageD / 2));
          return;
        }
      }
    }

    L(`prune: deleted ${deletedFiles} files`);

    // if the total size is larger than $PRUNE_SIZE_MB, delete files half the age
    if (totalSize > PRUNE_SIZE_MB * 1024 * 1024) {
      L(`prune: too much data`);
      await this.prune(Math.floor(ageD / 2));
    }
  }

  public async keys(): Promise<string[]> {
    return await this.getAllFiles();
  }

  // TODO: this is synchroneous.
  // Changing it to async would be great, but needs a lot of additional work in the frontend.
  public save(data, type, ipynb?): string {
    const hash = sha1(data);
    const path = join(BLOB_DIR, hash);

    // JSON serialize the data, type and ipynb and compress using brotliCompress
    const raw: Data = { data, type, ipynb };
    const ser = brotliCompressSync(JSON.stringify(raw));

    // replaces the file if it alrady exists
    writeFileSync(path, ser);

    // add size of path to haveSavedMB
    const stats = statSync(path);
    this.haveSavedMB += stats.size / 1024 / 1024;

    L(`saved ${hash} successfully. haveSavedMB=${this.haveSavedMB}`);

    // prune, if we are at most 20% over
    if (this.haveSavedMB > PRUNE_SIZE_MB / 5) {
      this.prune();
      this.haveSavedMB = 0;
    }

    return hash;
  }

  private getData(sha1: string): Data | undefined {
    // read the sha1 named file, decrompess it, and return it
    const path = join(BLOB_DIR, sha1);
    try {
      const buf = brotliDecompressSync(readFileSync(path));
      touch(path, false); // we don't wait for this to finish
      return JSON.parse(buf.toString());
    } catch (err) {
      L(`failed to get blob ${sha1}: ${err}`);
      return undefined;
    }
  }

  public get(sha1: string): Buffer | undefined {
    const row = this.getData(sha1);
    if (row?.data == null) return;
    return this.encodeData(row.data, row.type);
  }

  public get_ipynb(sha1: string): any {
    const row = this.getData(sha1);
    L(`get_ipynb: ${sha1} ipynb=${row?.ipynb?.slice(0, 100)}`);
    if (row == null) return;
    if (row.ipynb != null) return row.ipynb;
    if (row.data != null) return row.data;
  }

  private encodeData(data: string, type?: string): Buffer {
    if (typeof type === "string" && BASE64_TYPES.includes(type as any)) {
      return Buffer.from(data, "base64");
    } else {
      return Buffer.from(data);
    }
  }

  // Read a file from disk and save it in the database.
  // Returns the sha1 hash of the file.
  async readFile(path: string, type: string): Promise<string> {
    return await this.save(await readFile(path), type);
  }
}
