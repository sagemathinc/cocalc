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

const logger = getLogger("compute:send-files");

export default function sendFiles(project_id: string) {
  const remote = join(getProjectWebsocketUrl(project_id), "sync-fs", "recv");
  logger.debug("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  const ws = new WebSocket(remote, { headers });
  ws.on("open", () => {
    sendFilesWS({ ws, HOME: "/tmp" });
  });
}
