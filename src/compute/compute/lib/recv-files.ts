/*
Receive files from the project over a websocket.
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

export default async function sendFiles(project_id: string) {
  await callback(doSendFiles, project_id);
}

function doSendFiles(project_id: string, cb) {
  const remote = join(getProjectWebsocketUrl(project_id), "sync-fs", "send");
  logger.debug("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  const ws = new WebSocket(remote, { headers });
  ws.on("open", () => {
    logger.debug("connected to ", remote);
    recvFilesWS({ ws, HOME: "/tmp" });
  });
  ws.on("close", () => {
    cb?.();
  });
  ws.on("error", (err) => {
    cb(err);
    cb = undefined;
  });
}
