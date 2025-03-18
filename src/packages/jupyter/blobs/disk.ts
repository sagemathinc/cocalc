/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import LRU from "lru-cache";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

import Logger from "@cocalc/backend/logger";
import { envToInt } from "@cocalc/backend/misc/env-to-number";
import { touch } from "@cocalc/backend/misc/touch";
import { sha1 } from "@cocalc/backend/sha1";
import type { BlobStoreInterface } from "@cocalc/jupyter/types/project-interface";
import { BASE64_TYPES } from "./get";

const { debug: D, info: I, warn: W } = Logger("jupyter-blobs:disk");

// the directory where files are stored. by default, in the home directory
// in ~/.cache/cocalc/blobs. The path can be overwritten by setting the
// environment variable JUPYTER_BLOBS_DB_DIR.

const BLOB_DIR =
  process.env["JUPYTER_BLOBS_DB_DIR"] ?? join(homedir(), ".cache/cocalc/blobs");

// read the integer from JUPYTER_BLOBS_DB_DIR_PRUNE_SIZE_MB, or default to 200
const PRUNE_SIZE_MB = envToInt("JUPYTER_BLOBSTORE_DISK_PRUNE_SIZE_MB", 100);
const PRUNE_ENTRIES = envToInt("JUPYTER_BLOBSTORE_DISK_PRUNE_ENTRIES", 200);

interface FStat {
  mtime: number;
  size: number;
}

const cache = new LRU<string, FStat>({
  max: 2 * PRUNE_ENTRIES,
});

async function getStats(path: string): Promise<FStat> {
  const ret = cache.get(path);
  if (ret != null) return ret;
  const stats = await stat(path);
  const info = { mtime: stats.mtime.getTime(), size: stats.size };
  cache.set(path, info);
  return info;
}

// The JSON-serizalized and compressed structure we store per entry.
interface Data {
  ipynb?: string;
  type?: string;
  data?: string;
}

export class BlobStoreDisk implements BlobStoreInterface {
  private hashLength: number;
  private haveSavedMB: number = 0;
  private haveSavedCount: number = 0;

  constructor() {
    this.prune = reuseInFlight(this.prune.bind(this));
    this.hashLength = sha1("test").length;
  }

  public async init() {
    D(
      `initializing blob store in ${BLOB_DIR} with prune params: size=${PRUNE_SIZE_MB}MB and max entries=${PRUNE_ENTRIES}`
    );
    try {
      await mkdir(BLOB_DIR, { recursive: true });
      // call this.prune in 1 minute
      setTimeout(() => this.prune(), 60 * 1000);
      D(`successfully initialized blob store`);
    } catch (err) {
      W(`failed to initialize blob store: ${err}`);
      throw err;
    }
  }

  private async getAllFiles() {
    const files = await readdir(BLOB_DIR);
    return files.filter((file) => file.length === this.hashLength);
  }

  public async delete_all_blobs(): Promise<number> {
    let deletedFiles = 0;
    for (const file of await this.getAllFiles()) {
      deletedFiles += await this.delete(join(BLOB_DIR, file));
    }
    return deletedFiles;
  }

  // we compute the median of all mtimes and delete files older than that.
  // @return the number of deleted files
  private async deleteOldFiles(): Promise<number> {
    const allFiles = await this.getAllFiles();
    if (allFiles.length <= 5) {
      return await this.delete_all_blobs();
    }
    const times: number[] = [];
    for (const fn of allFiles) {
      times.push((await getStats(join(BLOB_DIR, fn))).mtime);
    }
    const sorted = times.sort();
    const median = sorted[Math.floor(sorted.length / 2)];
    const filesToDelete = allFiles.filter(
      (file) => (cache.get(join(BLOB_DIR, file))?.mtime ?? median) < median
    );
    let filesDeleted = 0;
    for (const file of filesToDelete) {
      const path = join(BLOB_DIR, file);
      filesDeleted += await this.delete(path);
    }
    return filesDeleted;
  }

  // NOTE: this is wrapped in a reuseInFlight, so it only runs once at a time
  private async prune() {
    let deletedFiles = 0;
    let numberGood = true;
    let sizeGood = true;

    // for up to 3 times we try to prune
    for (let i = 0; i < 3; i++) {
      const allFiles = await this.getAllFiles();
      numberGood = allFiles.length < PRUNE_ENTRIES;
      if (!numberGood) {
        D(`prune: ${allFiles.length} are too many files`);
        deletedFiles += await this.deleteOldFiles();
        continue;
      }

      let totalSize = 0;
      for (const fn of allFiles) {
        const stats = await getStats(join(BLOB_DIR, fn));
        totalSize += stats.size;
        sizeGood = totalSize < PRUNE_SIZE_MB * 1024 * 1024;
        if (!sizeGood) {
          D(`prune: ${totalSize}mb is too much size`);
          deletedFiles += await this.deleteOldFiles();
          continue;
        }
      }

      if (sizeGood && numberGood) {
        D(`prune: deleted ${deletedFiles} files`);
        return;
      }
    }

    // not all good after three tries, so delete everything
    if (!sizeGood || !numberGood) {
      deletedFiles += await this.delete_all_blobs();
      D(`prune/everything: deleted ${deletedFiles} files`);
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

    // replaces the file if it already exists
    writeFileSync(path, ser);

    // add size of path to haveSavedMB
    const stats = statSync(path);
    this.haveSavedMB += stats.size / 1024 / 1024;
    this.haveSavedCount += 1;
    D(
      `Saved ${hash} successfully. haveSavedMB=${this.haveSavedMB}, haveSavedCount=${this.haveSavedCount}`
    );
    this.checkPrune();
    return hash;
  }

  // prune, if we are at most 20% over
  private async checkPrune() {
    if (
      this.haveSavedMB > PRUNE_SIZE_MB / 5 ||
      this.haveSavedCount > PRUNE_ENTRIES / 5
    ) {
      try {
        await this.prune();
        this.haveSavedMB = 0;
        this.haveSavedCount = 0;
      } catch (err) {
        W(`failed to prune: ${err}`);
      }
    }
  }

  private getData(sha1: string): Data | undefined {
    // read the sha1 named file, decrompress it, and return it
    const path = join(BLOB_DIR, sha1);
    try {
      const buf = brotliDecompressSync(readFileSync(path));
      touch(path, false); // we don't wait for this to finish
      return JSON.parse(buf.toString());
    } catch (err) {
      I(`failed to get blob ${sha1}: ${err}`);
      this.delete(path);
      return undefined;
    }
  }

  private async delete(path: string): Promise<0 | 1> {
    try {
      await unlink(path);
      cache.delete(path);
      return 1;
    } catch {}
    return 0;
  }

  public get(sha1: string): Buffer | undefined {
    const row = this.getData(sha1);
    if (row?.data == null) return;
    return this.encodeData(row.data, row.type);
  }

  public get_ipynb(sha1: string): any {
    const row = this.getData(sha1);
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
