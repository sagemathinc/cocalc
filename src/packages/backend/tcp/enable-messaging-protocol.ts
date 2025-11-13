/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*

Enable two new functions write_mesg and recv_mesg on a TCP socket.

*/

import { Buffer } from "node:buffer";
import { Socket } from "node:net";

import getLogger from "@cocalc/backend/logger";
import { error } from "@cocalc/util/message";
import { from_json_socket, to_json_socket, trunc } from "@cocalc/util/misc";

const winston = getLogger("tcp.enable");

export type Type = "json" | "blob";

export interface Message {
  id?: string;
  uuid?: string;
  blob?: Buffer | string;
  ttlSeconds?: number;
  event?: "sage_raw_input" | "hello";
  value?: any;
  done?: boolean;
}

interface RecvMesgOpts {
  type: Type;
  id: string; // or uuid
  cb: (message: object) => void; // called with cb(mesg)
  timeout?: number; // units of **seconds** (NOT ms!).
}

export interface CoCalcSocket extends Socket {
  id: string;
  pid?: number;
  heartbeat?: Date;
  write_mesg: (
    type: Type,
    mesg: Message,
    cb?: (err?: string | Error) => void,
  ) => void;
  recv_mesg: (opts: RecvMesgOpts) => void;
}

export default function enable(socket: CoCalcSocket, desc: string = "") {
  socket.setMaxListeners(500); // we use a lot of listeners for listening for messages

  let buf: Uint8Array | null = null;
  let bufTargetLength = -1;

  const listenForMesg = (data: Uint8Array) => {
    buf = buf == null ? data : new Uint8Array([...buf, ...data]);
    while (true) {
      if (bufTargetLength === -1) {
        // starting to read a new message
        if (buf.length >= 4) {
          const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          bufTargetLength = dv.getUint32(0) + 4;
        } else {
          return; // have to wait for more data to find out message length
        }
      }
      if (bufTargetLength <= buf.length) {
        // read a new message from our buffer
        const type = String.fromCharCode(buf[4]);
        const mesg = buf.slice(5, bufTargetLength);

        const textDecoder = new TextDecoder();
        switch (type) {
          case "j": // JSON
            const s = textDecoder.decode(mesg);
            try {
              // Do not use "obj = JSON.parse(s)"
              const obj = from_json_socket(s); // this properly parses Date objects
              socket.emit("mesg", "json", obj);
            } catch (err) {
              winston.debug(
                `WARNING: failed to parse JSON message='${trunc(
                  s,
                  512,
                )}' on socket ${desc} - ${err}`,
              );
              // skip it.
              return;
            }
            break;
          case "b": // BLOB (tagged by a uuid)
            socket.emit("mesg", "blob", {
              uuid: textDecoder.decode(mesg.slice(0, 36)),
              blob: mesg.slice(36),
            });
            break;
          default:
            // NOTE -- better to show warning than throw possibly uncaught exception, since
            // don't want malicious user to cause anything to crash.
            winston.debug(`WARNING: unknown message type: '${type}'`);
            return;
        }
        buf = buf.slice(bufTargetLength);
        bufTargetLength = -1;
        if (buf.length === 0) {
          return;
        }
      } else {
        // nothing to do but wait for more data
        return;
      }
    }
  };

  socket.on("data", listenForMesg);

  socket.write_mesg = (
    type: Type,
    data: Message,
    cb?: (err?: string | Error) => void,
  ): void => {
    if (data == null) {
      // uncomment this to get a traceback to see what might be causing this...
      //throw Error(`write_mesg(type='${type}': data must be defined`);
      cb?.(`write_mesg(type='${type}': data must be defined`);
      return;
    }
    const send = function (s: string | ArrayBuffer): void {
      const length: Uint8Array = new Uint8Array(4);
      // This line was 4 hours of work.  It is absolutely
      // *critical* to change the (possibly a string) s into a
      // buffer before computing its length and sending it!!
      // Otherwise unicode characters will cause trouble.
      const data: Uint8Array = new Uint8Array(
        typeof s === "string" ? Buffer.from(s) : s,
      );

      const lengthView = new DataView(length.buffer);
      // this was buf.writeInt32BE, i.e. big endian
      lengthView.setInt32(0, data.byteLength, false); // false for big-endian

      if (!socket.writable) {
        cb?.("socket not writable");
        return;
      } else {
        socket.write(length);
        socket.write(data, cb);
      }
    };

    switch (type) {
      case "json":
        send("j" + to_json_socket(data));
        return;
      case "blob":
        if (data.uuid == null) {
          cb?.("data object *must* have a uuid attribute");
          return;
        }
        if (data.blob == null) {
          cb?.("data object *must* have a blob attribute");
          return;
        }
        send(
          new Uint8Array([
            ...Buffer.from("b"),
            ...Buffer.from(data.uuid),
            ...(Buffer.isBuffer(data.blob)
              ? data.blob
              : Buffer.from(data.blob)),
          ]).buffer,
        );
        return;
      default:
        cb?.(`unknown message type '${type}'`);
        return;
    }
  };

  // Wait until we receive exactly *one* message of the given type
  // with the given id, then call the callback with that message.
  // (If the type is 'blob', with the given uuid.)
  socket.recv_mesg = ({ type, id, cb, timeout }: RecvMesgOpts): void => {
    let done: boolean = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const f = (mesgType: Type, mesg: Readonly<Message>) => {
      if (
        type === mesgType &&
        ((type === "json" && mesg.id === id) ||
          (type === "blob" && mesg.uuid === id))
      ) {
        if (done) return;
        socket.removeListener("mesg", f);
        done = true;
        if (timeoutId != null) {
          clearTimeout(timeoutId);
        }
        cb(mesg);
      }
    };

    socket.on("mesg", f);

    if (timeout != null) {
      timeoutId = setTimeout(() => {
        if (done) return;
        done = true;
        socket.removeListener("mesg", f);
        cb(error({ error: `Timed out after ${timeout} seconds.` }));
      }, timeout * 1000);
    }
  };
}
