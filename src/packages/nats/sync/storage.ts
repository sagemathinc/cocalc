import type { JSONValue } from "@cocalc/util/types";
import { human_readable_size as humanReadableSize } from "@cocalc/util/misc";

import * as msgpack from "@msgpack/msgpack";

export enum DataEncoding {
  MsgPack = 0,
  JsonCodec = 1,
}

export const DEFAULT_ENCODING = DataEncoding.MsgPack;

let textEncoder: TextEncoder | undefined = undefined;

function jsonEncoder(obj: any) {
  if (textEncoder === undefined) {
    textEncoder = new TextEncoder();
  }
  return textEncoder.encode(JSON.stringify(obj));
}
const MSGPACK_ENCODER_OPTIONS = {
  // ignoreUndefined is critical so database queries work properly, and
  // also we have a lot of api calls with tons of wasted undefined values.
  ignoreUndefined: true,
};

export function encode({
  encoding,
  mesg,
}: {
  encoding: DataEncoding;
  mesg: any;
}) {
  if (encoding == DataEncoding.MsgPack) {
    return msgpack.encode(mesg, MSGPACK_ENCODER_OPTIONS);
  } else if (encoding == DataEncoding.JsonCodec) {
    return jsonEncoder(mesg);
  } else {
    throw Error(`unknown encoding ${encoding}`);
  }
}

enum CompressionAlgorithm {
  None = 0,
  Zstd = 1,
}

interface Compression {
  // compression algorithm to use
  algorithm: CompressionAlgorithm;
  // only compress data above this size
  threshold: number;
}

const DEFAULT_COMPRESSION = {
  algorithm: CompressionAlgorithm.Zstd,
  threshold: 1024,
} as Compression;

export function compressRaw(raw): {
  raw: Buffer;
  compress: CompressionAlgorithm;
} {
  if (
    compress == null ||
    DEFAULT_COMPRESSION.algorithm == CompressionAlgorithm.None ||
    raw.length <= DEFAULT_COMPRESSION.threshold
  ) {
    return { raw, compress: CompressionAlgorithm.None };
  }
  if (DEFAULT_COMPRESSION.algorithm == CompressionAlgorithm.Zstd) {
    return { raw: compress(raw), compress: CompressionAlgorithm.Zstd };
  }
  throw Error("invalid compression algorithm");
}

export interface SqliteMessagesRow {
  time: number;
  key?: string;
  encoding: DataEncoding;
  raw: Buffer;
  headers?: string;
  compress: CompressionAlgorithm;
  size: number;
}

export interface StorageData {
  messages: SqliteMessagesRow[];
  name: string;
  desc: JSONValue;
  project_id?: string;
  account_id?: string;
}

let compress: any = null;
let betterSqlite3: any = null;
let ensureContainingDirectoryExists: any = null;
let rm: any = null;
export function setContext(x) {
  betterSqlite3 = x.betterSqlite3;
  compress = x.compress;
  ensureContainingDirectoryExists = x.ensureContainingDirectoryExists;
  rm = x.rm;
}

import { join } from "path";
export function storagePath({ account_id, project_id, name }: StorageData) {
  let userPath;
  if (account_id) {
    userPath = `accounts/${account_id}`;
  } else if (project_id) {
    userPath = `projects/${project_id}`;
  } else {
    userPath = "hub";
  }
  return join(userPath, name);
}

export async function write(
  data: StorageData,
): Promise<{ size: number; messages: number }> {
  if (data.messages.length == 0) {
    console.log("skipping empty stream");
    return { size: 0, messages: 0 };
  }
  const start = Date.now();
  const path = join(process.cwd(), storagePath(data) + ".db");
  await ensureContainingDirectoryExists(path);
  console.log("writing", path);
  await rm(path, { force: true });
  const db = new betterSqlite3(path);
  db.prepare(
    `CREATE TABLE messages ( 
          seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, time INTEGER NOT NULL, headers TEXT, compress NUMBER NOT NULL, encoding NUMBER NOT NULL, raw BLOB NOT NULL, size NUMBER NOT NULL, ttl NUMBER
          )
        `,
  ).run();
  db.prepare(
    ` CREATE TABLE config (
          field TEXT PRIMARY KEY, value TEXT NOT NULL
        )`,
  ).run();

  if (data.desc != null) {
    db.prepare("INSERT INTO config (field, value) VALUES(?, ?)").run(
      "desc",
      JSON.stringify(data.desc),
    );
  }

  const insertMessage = db.prepare(
    "INSERT INTO messages(time, compress, encoding, raw, headers, key, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  let size = 0;
  for (const msg of data.messages) {
    insertMessage.run(
      msg.time,
      msg.compress,
      msg.encoding,
      msg.raw,
      msg.headers ?? null,
      msg.key ?? null,
      msg.size,
    );
    size += msg.size;
  }

  console.log(
    `wrote ${data.messages.length} messages (${humanReadableSize(size)} data) to ${path} in ${Date.now() - start}ms`,
  );
  return { size, messages: data.messages.length };
}
