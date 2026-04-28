import * as msgpack from "@msgpack/msgpack";

export enum DataEncoding {
  MsgPack = 0,
  JsonCodec = 1,
}

// WARNING: do NOT change MSGPACK_ENCODER_OPTIONS unless you know what you're doing!
const MSGPACK_ENCODER_OPTIONS = {
  // ignoreUndefined is critical so database queries work properly, and
  // also we have a lot of api calls with tons of wasted undefined values.
  ignoreUndefined: true,
};

let textEncoder: any = undefined;
let textDecoder: any = undefined;

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

export function decode({
  encoding,
  data,
}: {
  encoding: DataEncoding;
  data;
}): any {
  if (encoding == DataEncoding.MsgPack) {
    return msgpack.decode(data);
  } else if (encoding == DataEncoding.JsonCodec) {
    return jsonDecoder(data);
  } else {
    throw Error(`unknown encoding ${encoding}`);
  }
}

function jsonEncoder(obj: any) {
  if (textEncoder === undefined) {
    textEncoder = new TextEncoder();
  }
  return textEncoder.encode(JSON.stringify(obj));
}

function jsonDecoder(data: Buffer): any {
  if (textDecoder === undefined) {
    textDecoder = new TextDecoder();
  }
  return JSON.parse(textDecoder.decode(data));
}
