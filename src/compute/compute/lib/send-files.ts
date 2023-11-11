/*
Sending files to the project over a websocket.
*/

import { apiKey } from "@cocalc/backend/data";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { getProjectWebsocketUrl } from "./util";
import { join } from "path";
import sendFilesWS from "@cocalc/sync-fs/lib/send-files";
import getLogger from "@cocalc/backend/logger";
import { serialize } from "cookie";
import WebSocket from "ws";
import { callback } from "awaiting";

const logger = getLogger("compute:send-files");

interface Options {
  project_id: string;
  // These are the args to tar after "c" and not involving compression, e.g., this
  // would send files listed in /tmp/files.txt:
  //    sendArgs = ["--no-recursion", "--verbatim-files-from", "--files-from", "/tmp/files.txt"]
  // You must give something here so we know what to send.
  // used to make the tarball
  sendArgs: string[];
  // used when extracting the tarball
  recvArgs: string[];
  // HOME directory for purposes of creating tarball
  HOME?: string;
}

export default async function sendFiles({
  project_id,
  sendArgs,
  recvArgs,
  HOME = process.env.HOME,
}: Options) {
  await callback(doSendFiles, project_id, sendArgs, recvArgs, HOME);
}

function doSendFiles(
  project_id: string,
  sendArgs: string[],
  recvArgs: string[],
  HOME,
  cb,
) {
  const remote = join(getProjectWebsocketUrl(project_id), "sync-fs", "recv");
  logger.debug("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  const ws = new WebSocket(remote, { headers });
  ws.on("open", () => {
    logger.debug("connected to ", remote);
    // tell it how to receive our files:
    logger.debug("sending recvArgs = ", recvArgs);
    ws.send(JSON.stringify(recvArgs));
    // send them
    sendFilesWS({ ws, args: sendArgs, HOME });
  });
  ws.on("close", () => {
    cb?.();
  });
  ws.on("error", (err) => {
    cb(err);
    cb = undefined;
  });
}
