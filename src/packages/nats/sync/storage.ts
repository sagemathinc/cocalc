import type { JSONValue } from "@cocalc/util/types";

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

let compress: any = null;
export function setCompress(compressFunction) {
  compress = compressFunction;
}

export function compressRaw(raw) {
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
}

export interface SqliteMessagesRow {
  seq: number;
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
