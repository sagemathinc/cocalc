/*
A handy utility function for implementing an api using the project websocket.
*/

import { callback } from "awaiting";
import type { ProjectWebsocket } from "./types";

export default async function call(
  conn: ProjectWebsocket,
  mesg: object,
  timeout_ms: number,
) {
  const resp = await callback(call0, conn, mesg, timeout_ms);
  if (resp?.status == "error") {
    throw Error(resp.error);
  }
  return resp;
}

function call0(
  conn: ProjectWebsocket,
  mesg: object,
  timeout_ms: number,
  cb: Function,
): void {
  let done: boolean = false;
  let timer: any = 0;
  if (timeout_ms) {
    timer = setTimeout(function () {
      if (done) return;
      done = true;
      cb("timeout");
    }, timeout_ms);
  }

  const t = Date.now();
  conn.writeAndWait(mesg, function (resp) {
    if (conn.verbose) {
      console.log(`call finished ${Date.now() - t}ms`, mesg, resp);
    }
    if (done) {
      return;
    }
    done = true;
    if (timer) {
      clearTimeout(timer);
    }
    cb(undefined, resp);
  });
}
