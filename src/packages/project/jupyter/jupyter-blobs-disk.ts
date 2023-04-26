/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as zlib from "node:zlib";
const { promisify } = require("node:util");

const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

import Logger from "@cocalc/backend/logger";
import { sha1, touch } from "@cocalc/backend/misc_node";
import { BlobStoreInterface } from "@cocalc/frontend/jupyter/project-interface";
import { days_ago } from "@cocalc/util/misc";

const L = Logger("jupyter-blobs:disk").debug;

// the directory where files are stored. by default, in the home directory
// in ~/.cache/cocalc/blobs. The path can be overwritten by setting the
// environment variable JUPYTER_BLOBS_DB_DIR.

// home directory

const BLOB_DIR = join(
  homedir(),
  process.env["JUPYTER_BLOBS_DB_DIR"] ?? ".cache/cocalc/blobs"
);

// read the integer from JUPYTER_BLOBS_DB_DIR_PRUNE_SIZE_MB, or default to 200
const PRUNE_SIZE_MB: number = parseInt(
  process.env["JUPYTER_BLOBS_DB_DIR_PRUNE_SIZE_MB"] ?? "200"
);

export class BlobStoreDisk implements BlobStoreInterface {
  private hashLength: number;
  private haveSavedMB: number = 0;

  constructor() {
    this.hashLength = sha1("test").length;
  }

  public async init() {
    L(
      `initializing blob store in ${BLOB_DIR} with prune size ${PRUNE_SIZE_MB}MB`
    );
    try {
      await mkdir(BLOB_DIR, { recursive: true });
      await this.prune();

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

  private async prune(ageD = 100) {
    if (ageD < 3) {
      await this.delete_all_blobs();
      return;
    }

    const cutoff = days_ago(ageD);
    let totalSize = 0;
    for (const file of await this.getAllFiles()) {
      const path = join(BLOB_DIR, file);
      const stats = await stat(path);
      if (stats.mtime < cutoff) {
        await unlink(path);
      } else {
        // sum up to total size of files
        totalSize += stats.size;
      }
    }

    // if the total size is larger than 200MB, delete files half the age
    if (totalSize > PRUNE_SIZE_MB * 1024 * 1024) {
      await this.prune(Math.floor(ageD / 2));
    }
  }

  public async keys(): Promise<string[]> {
    return await this.getAllFiles();
  }

  public async save(data, type, ipynb?): Promise<string> {
    // this is in the sqlite variant, but we don't need it?!
    // if (BASE64_TYPES.includes(type)) {
    //   data = Buffer.from(data, "base64");
    // } else {
    //   data = Buffer.from(data);
    // }

    const hash = sha1(data);
    const path = join(BLOB_DIR, hash);

    // JSON serialize the data, type and ipynb and compress using brotliCompress
    const ser = await brotliCompress(JSON.stringify({ data, type, ipynb }));

    // replaces the file if it alrady exists
    await writeFile(path, ser);

    // add size of path to haveSavedMB
    const stats = await stat(path);
    this.haveSavedMB += stats.size / 1024 / 1024;

    // prune, if we are at most 20% over
    if (this.haveSavedMB > PRUNE_SIZE_MB / 5) {
      await this.prune();
      this.haveSavedMB = 0;
    }

    return hash;
  }

  public async getData(
    sha1: string
  ): Promise<{ ipynb?: string; type?: string; data?: string } | undefined> {
    // read the file wiht the name sha1, decrompess it, and return it
    const path = join(BLOB_DIR, sha1);
    try {
      const raw = await brotliDecompress(await readFile(path));
      touch(path); // we don't wait for this to finish
      return JSON.parse(raw);
    } catch (err) {
      L(`failed to get blob ${sha1}: ${err}`);
      return undefined;
    }
  }

  public async get(sha1: string): Promise<Buffer | undefined> {
    const data = (await this.getData(sha1))?.data;
    if (data == null) return;
    return Buffer.from(data, "base64");
  }

  public async get_ipynb(sha1: string): Promise<any> {
    const row = await this.getData(sha1);
    if (row == null) return;
    if (row.ipynb != null) return row.ipynb;
    if (row.data != null) return row.data;
  }

  // Read a file from disk and save it in the database.
  // Returns the sha1 hash of the file.
  async readFile(path: string, type: string): Promise<string> {
    return await this.save(await readFile(path), type);
  }
}
