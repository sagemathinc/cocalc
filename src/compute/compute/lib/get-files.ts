/*
Get files from the project over a websocket.

We don't call this "receive" because it's isn't just passively waiting to
receive something.
*/

import { apiKey } from "@cocalc/backend/data";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { getProjectWebsocketUrl } from "./util";
import { join } from "path";
import recvFilesWS from "@cocalc/sync-fs/lib/recv-files";
import getLogger from "@cocalc/backend/logger";
import { serialize } from "cookie";
import WebSocket from "ws";
import { callback } from "awaiting";

const logger = getLogger("compute:recv-files");

interface Options {
  project_id: string;
  // used to make the tarball
  sendArgs: string[];
  // used when extracting the tarball
  recvArgs: string[];
  // our local HOME here
  HOME?: string;
}

export default async function getFiles({
  project_id,
  sendArgs,
  recvArgs,
  HOME = process.env.HOME,
}: Options) {
  await callback(doGetFiles, project_id, sendArgs, recvArgs, HOME);
}

function doGetFiles(project_id: string, sendArgs, recvArgs, HOME, cb) {
  const remote = join(getProjectWebsocketUrl(project_id), "sync-fs", "send");
  logger.debug("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  const ws = new WebSocket(remote, { headers });

  ws.on("open", () => {
    logger.debug("connected to ", remote);
    // tell it how/what to send us files
    ws.send(JSON.stringify(sendArgs));
    // receive the files
    recvFilesWS({ ws, HOME, args: recvArgs });
  });

  ws.on("close", () => {
    cb?.();
  });
  ws.on("error", (err) => {
    cb(err);
    cb = undefined;
  });
}
