/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */

import zlib from "zlibjs";
import { ord } from "./util.js";
import { bencode, bdecode } from "./bencode.js";
import { HEADER_SIZE } from "./constants.js";

const debug = (...args) => {
  if (
    args[1].match(/^(ping|pointer|button|cursor|draw|damage|sound-data)/) ===
    null
  ) {
    console.debug(...args);
  }
};

/**
 * Inflates compressed data
 */
const inflate = (level, size, data) => {
  if (level !== 0) {
    if (level & 0x10) {
      console.error("lz4 compression not supported");
      return null;
      //const { inflated, uncompressedSize } = lz4decode(data);

      // if lz4 errors out at the end of the buffer, ignore it:
      if (uncompressedSize <= 0 && size + uncompressedSize !== 0) {
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
};

/**
 * Decodes a packet
 */
const decode = (inflated, rawQueue) => {
  let packet = bdecode(inflated);
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
};

/**
 * Gets a Uint8 draw data
 */
const imageData = data => {
  if (typeof data === "string") {
    const uint = new Uint8Array(data.length);

    for (let i = 0, j = data.length; i < j; ++i) {
      uint[i] = data.charCodeAt(i);
    }

    return uint;
  }

  return null; // Already uint
};

/**
 * Parses an incoming packet
 */
const parsePacket = (header, queue) => {
  // check for crypto protocol flag
  const proto = {
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

  /* TODO
  if (proto.crypto) {
    proto.padding = (this.cipher_in_block_size - packetSize % this.cipher_in_block_size);
    packetSize += proto.padding;
  }
  */

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
};

/**
 * Serializes an outgoing packet
 */
const serializePacket = data => {
  const level = 0; // TODO: zlib, but does not work
  const proto_flags = 0;

  /* TODO:
  if(this.cipher_out) {
    proto_flags = 0x2;
    var padding_size = this.cipher_out_block_size - (payload_size % this.cipher_out_block_size);
    for (var i = padding_size - 1; i >= 0; i--) {
      bdata += String.fromCharCode(padding_size);
    };
    this.cipher_out.update(forge.util.createBuffer(bdata));
    bdata = this.cipher_out.output.getBytes();
  }
  */

  const size = data.length;
  const send = data.split("").map(ord);
  const header = [ord("P"), proto_flags, level, 0];

  for (let i = 3; i >= 0; i--) {
    header.push((size >> (8 * i)) & 0xff);
  }

  return [...header, ...send];
};

/**
 * Creates a new receieve queue handler
 */
export const createReceiveQueue = callback => {
  let queue = [];
  let header = [];
  let rawQueue = [];

  const processHeader = () => {
    if (header.length < HEADER_SIZE && queue.length > 0) {
      // add from receive queue data to header until we get the 8 bytes we need:
      while (header.length < HEADER_SIZE && queue.length > 0) {
        const slice = queue[0];
        const needed = HEADER_SIZE - header.length;
        const num = Math.min(needed, slice.length);

        for (let i = 0; i < num; i++) {
          header.push(slice[i]);
        }

        // replace the slice with what is left over:
        if (slice.length > needed) {
          queue[0] = slice.subarray(num);
        } else {
          // this slice has been fully consumed already:
          queue.shift();
        }

        if (header[0] !== ord("P")) {
          console.error("Invalid packet header format", header, ord("P"));
          return false;
        }
      }
    }

    // The packet has still not been downloaded, we need to wait
    if (header.length < HEADER_SIZE) {
      //console.warn('Waiting for rest of packet...');
      return false;
    }

    return true;
  };

  const processData = (level, proto, packetSize) => {
    let packetData;
    // exact match: the payload is in a buffer already:
    if (queue[0].length === packetSize) {
      packetData = queue.shift();
    } else {
      // aggregate all the buffers into "packet_data" until we get exactly "packet_size" bytes:
      packetData = new Uint8Array(packetSize);

      let rsize = 0;
      while (rsize < packetSize) {
        const slice = queue[0];
        const needed = packetSize - rsize;

        // add part of this slice
        if (slice.length > needed) {
          packetData.set(slice.subarray(0, needed), rsize);
          rsize += needed;
          queue[0] = slice.subarray(needed);
        } else {
          // add this slice in full
          packetData.set(slice, rsize);
          rsize += slice.length;
          queue.shift();
        }
      }
    }

    // TODO: Proto
    /*
    if (proto.crypto) {
      this.cipher_in.update(forge.util.createBuffer(uintToString(packet_data)));
      const decrypted = this.cipher_in.output.getBytes();
      packet_data = [];
      for (i=0; i<decrypted.length; i++)
        packet_data.push(decrypted[i].charCodeAt(0));
      packet_data = packet_data.slice(0, -1 * padding);
    }
    */

    return inflate(level, packetSize, packetData);
  };

  const process = () => {
    if (!processHeader()) {
      return false;
    }

    const result = parsePacket(header, queue);
    if (result === false) {
      return false;
    }

    header = [];

    const { index, level, proto, packetSize } = result;
    const inflated = processData(level, proto, packetSize);

    // save it for later? (partial raw packet)
    if (index > 0) {
      rawQueue[index] = inflated;
    } else {
      // decode raw packet string into objects:
      try {
        const packet = decode(inflated, rawQueue);

        debug("<<<", ...packet);

        callback(...packet);

        rawQueue = [];
      } catch (e) {
        console.error("error decoding packet", e);
        return false;
      }
    }

    return true;
  };

  return {
    clear: () => {
      queue = [];
    },

    push: data => {
      queue.push(data);
      process();
    }
  };
};

/**
 * Creates a new send queue handler
 */
export const createSendQueue = () => {
  let queue = [];

  const process = socket => {
    while (queue.length !== 0) {
      const packet = queue.shift();
      if (!packet || !socket) {
        continue;
      }

      debug(">>>", ...packet);

      const data = bencode(packet);
      const pkg = serializePacket(data);
      const out = new Uint8Array(pkg).buffer;

      socket.send(out);
    }
  };

  return {
    clear: () => {
      queue = [];
    },

    push: (data, socket) => {
      queue.push(data);
      process(socket);
    }
  };
};
