/**
 * CoCalc Xpra HTML Client
 */

const DEBUG = false;

import * as zlib from "zlibjs";
import { ord } from "./util";
import { bencode, bdecode } from "./bencode";
import { HEADER_SIZE } from "./constants";

require("./lz4");

let debug;
if (DEBUG) {
  debug = console.log;
} else {
  debug = function(..._) {};
}

// Inflates compressed data
function inflate(
  level: number,
  size: number,
  data: Uint8Array
): Uint8Array | null {
  if (level !== 0) {
    if (level & 0x10) {
      // lz4
      // python-lz4 inserts the length of the uncompressed data as an int
      // at the start of the stream
      const d = data.subarray(0, 4);
      // output buffer length is stored as little endian
      const length = d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24);
      // decode the LZ4 block
      const inflated = new Uint8Array(length);
      const uncompressedSize = (window as any).lz4.decodeBlock(
        data,
        inflated,
        4
      );
      // if lz4 errors out at the end of the buffer, ignore it:
      if (uncompressedSize <= 0 && size + uncompressedSize != 0) {
        console.error(
          "failed to decompress lz4 data, error code",
          uncompressedSize
        );
        return null;
      }
      return inflated;
    } else {
      return zlib.inflateSync(data);
    }
  }

  return data;
}

// Decodes a packet
function decode(inflated: Uint8Array, rawQueue: Uint8Array[]): any[] {
  let packet = bdecode(inflated);
  if (packet == null) {
    throw Error("unable to decode packet");
  }
  for (let index in rawQueue) {
    packet[index] = rawQueue[index];
  }

  if (packet[0] === "draw" && packet[6] !== "scroll") {
    const uint = imageData(packet[7]);
    if (uint !== null) {
      packet[7] = uint;
    }
  }

  return packet;
}

// Gets a Uint8 draw data
function imageData(data: string | Uint8Array): Uint8Array | null {
  if (typeof data === "string") {
    const uint = new Uint8Array(data.length);

    for (let i = 0, j = data.length; i < j; ++i) {
      uint[i] = data.charCodeAt(i);
    }

    return uint;
  }

  return null; // Already uint
}

interface Proto {
  flags: number;
  padding: number;
  crypto: number;
}

// Parses an incoming packet
function parsePacket(
  header: number[],
  queue
):
  | false
  | {
      index: number;
      level: number;
      proto: Proto;
      packetSize: number;
    } {
  // check for crypto protocol flag
  const proto: Proto = {
    flags: header[1],
    padding: 0,
    crypto: header[1] & 0x2
  };

  if (proto.flags !== 0 && !proto.crypto) {
    console.error("we can't handle this protocol flag yet", proto);
    return false;
  }

  const level = header[2];
  if (level & 0x20) {
    console.error("lzo compression is not supported");
    return false;
  }

  const index = header[3];
  if (index >= 20) {
    console.error("Invalid packet index", index);
    return false;
  }

  let packetSize = 0;
  for (let i = 0; i < 4; i++) {
    packetSize = packetSize * 0x100;
    packetSize += header[4 + i];
  }

  // verify that we have enough data for the full payload:
  let rsize = 0;
  for (let i = 0, j = queue.length; i < j; ++i) {
    rsize += queue[i].length;
  }

  if (rsize < packetSize) {
    //console.warn('We did not get full payload');
    return false;
  }

  return { index, level, proto, packetSize };
}

// Serializes an outgoing packet
function serializePacket(data: string): number[] {
  const level = 0; // TODO: zlib, but does not work
  const proto_flags = 0;

  const size = data.length;
  const send = data.split("").map(ord);
  const header = [ord("P"), proto_flags, level, 0];

  for (let i = 3; i >= 0; i--) {
    header.push((size >> (8 * i)) & 0xff);
  }

  return [...header, ...send];
}

// The receive queue handler
export class ReceiveQueue {
  private callback: Function;
  private queue: Uint8Array[] = [];
  private header: number[] = [];
  private rawQueue: Uint8Array[] = [];

  constructor(callback) {
    this.callback = callback;
  }

  private processHeader(): boolean {
    if (this.header.length < HEADER_SIZE && this.queue.length > 0) {
      // add from receive queue data to header until we get the 8 bytes we need:
      while (this.header.length < HEADER_SIZE && this.queue.length > 0) {
        const slice = this.queue[0];
        const needed = HEADER_SIZE - this.header.length;
        const num = Math.min(needed, slice.length);

        for (let i = 0; i < num; i++) {
          this.header.push(slice[i]);
        }

        // replace the slice with what is left over:
        if (slice.length > needed) {
          this.queue[0] = slice.subarray(num);
        } else {
          // this slice has been fully consumed already:
          this.queue.shift();
        }

        if (this.header[0] !== ord("P")) {
          console.error("Invalid packet header format", this.header, ord("P"));
          return false;
        }
      }
    }

    // The packet has still not been downloaded, we need to wait
    if (this.header.length < HEADER_SIZE) {
      //console.warn('Waiting for rest of packet...');
      return false;
    }

    return true;
  }

  private processData(
    level: number,
    _: Proto,
    packetSize: number
  ): Uint8Array | null {
    let packetData;
    // exact match: the payload is in a buffer already:
    if (this.queue[0].length === packetSize) {
      packetData = this.queue.shift();
    } else {
      // aggregate all the buffers into "packet_data" until we get exactly "packet_size" bytes:
      packetData = new Uint8Array(packetSize);

      let rsize = 0;
      while (rsize < packetSize) {
        const slice = this.queue[0];
        const needed = packetSize - rsize;

        // add part of this slice
        if (slice.length > needed) {
          packetData.set(slice.subarray(0, needed), rsize);
          rsize += needed;
          this.queue[0] = slice.subarray(needed);
        } else {
          // add this slice in full
          packetData.set(slice, rsize);
          rsize += slice.length;
          this.queue.shift();
        }
      }
    }

    return inflate(level, packetSize, packetData);
  }

  private process(): boolean {
    if (!this.processHeader()) {
      return false;
    }

    const result = parsePacket(this.header, this.queue);
    if (result === false) {
      return false;
    }

    this.header = [];

    const { index, level, proto, packetSize } = result;
    const inflated = this.processData(level, proto, packetSize);
    if (inflated === null) {
      return false;
    }

    // save it for later? (partial raw packet)
    if (index > 0) {
      this.rawQueue[index] = inflated;
    } else {
      // decode raw packet string into objects:
      try {
        const packet = decode(inflated, this.rawQueue);

        debug("<<<", ...packet);

        this.callback(...packet);

        this.rawQueue = [];
      } catch (e) {
        console.error("error decoding packet", e);
        return false;
      }
    }

    return true;
  }

  clear(): void {
    this.queue = [];
  }

  push(data): void {
    this.queue.push(data);
    this.process();
  }
}

// It's a string and then a bunch of numbers and
// other objects (?), e.g.,
//  ["damage-sequence", 2, 48, 1509, 590, 33874, ""]
// and
//  ["pointer-position", 61, Array(2), Array(0), Array(0)]
type QueueData = any[];

// The Send queue handler
export class SendQueue {
  private queue: QueueData[] = [];

  private process(socket: WebSocket): void {
    while (this.queue.length !== 0) {
      const packet = this.queue.shift();
      if (!packet || !socket) {
        continue;
      }

      debug(">>>", ...packet);

      const data = bencode(packet);
      const pkg = serializePacket(data);
      const out = new Uint8Array(pkg).buffer;

      socket.send(out);
    }
  }

  clear(): void {
    this.queue = [];
  }

  push(data: QueueData, socket: WebSocket): void {
    this.queue.push(data);
    this.process(socket);
  }
}
