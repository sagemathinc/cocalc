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

export default async function recvFiles(project_id: string) {
  await callback(doRecvFiles, project_id);
}

function doRecvFiles(project_id: string, cb) {
  const remote = join(getProjectWebsocketUrl(project_id), "sync-fs", "recv");
  logger.debug("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  const ws = new WebSocket(remote, { headers });
  ws.on("open", () => {
    logger.debug("connected to ", remote);
    sendFilesWS({ ws, HOME: "/tmp" });
  });
  ws.on("close", () => {
    cb?.();
  });
  ws.on("error", (err) => {
    cb(err);
    cb = undefined;
  });
}
