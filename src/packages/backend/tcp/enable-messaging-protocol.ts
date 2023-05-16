/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

Enable two new functions write_mesg and recv_mesg on a TCP socket.

*/

import { Socket } from "node:net";

import getLogger from "@cocalc/backend/logger";
import { error } from "@cocalc/util/message";
import { from_json_socket, to_json_socket, trunc } from "@cocalc/util/misc";

const winston = getLogger("tcp.enable");

type Type = "json" | "blob";

interface Message {
  id?: string;
  uuid?: string;
  blob?: Buffer | string;
  ttlSeconds?: number;
  event?: "sage_raw_input" | "hello";
  value?: any;
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
    cb?: (err?: string | Error) => void
  ) => void;
  recv_mesg: (opts: RecvMesgOpts) => void;
}

export default function enable(socket: CoCalcSocket, desc: string = "") {
  socket.setMaxListeners(500); // we use a lot of listeners for listening for messages

  let buf: Buffer | null = null;
  let bufTargetLength = -1;

  const listenForMesg = (data: Buffer) => {
    buf = buf == null ? data : Buffer.concat([buf, data]);
    while (true) {
      if (bufTargetLength === -1) {
        // starting to read a new message
        if (buf.length >= 4) {
          bufTargetLength = buf.readUInt32BE(0) + 4;
        } else {
          return; // have to wait for more data to find out message length
        }
      }
      if (bufTargetLength <= buf.length) {
        // read a new message from our buffer
        const type = buf.slice(4, 5).toString();
        const mesg = buf.slice(5, bufTargetLength);
        switch (type) {
          case "j": // JSON
            const s = mesg.toString();
            let obj;
            try {
              // Do not use "obj = JSON.parse(s)"
              obj = from_json_socket(s); // this properly parses Date objects
            } catch (err) {
              winston.debug(
                `WARNING: failed to parse JSON message='${trunc(
                  s,
                  512
                )}' on socket ${desc} - ${err}`
              );
              // skip it.
              return;
            }
            socket.emit("mesg", "json", obj);
            break;
          case "b": // BLOB (tagged by a uuid)
            socket.emit("mesg", "blob", {
              uuid: mesg.slice(0, 36).toString(),
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
    cb?: (err?: string | Error) => void
  ): void => {
    if (data == null) {
      // uncomment this to get a traceback to see what might be causing this...
      //throw Error(`write_mesg(type='${type}': data must be defined`);
      cb?.(`write_mesg(type='${type}': data must be defined`);
      return;
    }
    const send = function (s: string | Buffer): void {
      const buf = Buffer.alloc(4);
      // This line was 4 hours of work.  It is absolutely
      // *critical* to change the (possibly a string) s into a
      // buffer before computing its length and sending it!!
      // Otherwise unicode characters will cause trouble.
      if (typeof s === "string") {
        s = Buffer.from(s);
      }
      buf.writeInt32BE(s.length, 0);
      if (!socket.writable) {
        cb?.("socket not writable");
        return;
      } else {
        socket.write(buf);
      }

      if (!socket.writable) {
        cb?.("socket not writable");
        return;
      } else {
        socket.write(s, cb);
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
          Buffer.concat([
            Buffer.from("b"),
            Buffer.from(data.uuid),
            Buffer.from(data.blob),
          ])
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
