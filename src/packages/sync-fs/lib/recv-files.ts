/*
Recieve files over a websocket.
*/

import getLogger from "@cocalc/backend/logger";
const logger = getLogger("sync-fs:recv-files");

import { spawn } from "child_process";

export default function recvFiles(ws) {
  const tar = spawn("tar", ["-I", "lz4", "-x", "--delay-directory-restore"], {
    cwd: process.env.HOME,
  });
  let start = Date.now();
  logger.debug("got connection", start);
  let fileSize = 0;
  ws.on("message", (data) => {
    if (data instanceof Buffer) {
      logger.debug("received ", data.length, "bytes");
      fileSize += data.length;
      tar.stdin.write(data);
    }
  });
  ws.on("close", () => {
    tar.stdin.end();
    let end = Date.now();
    let timeTaken = (end - start) / 1000; // convert ms to s
    let speed = fileSize / timeTaken / 1000000;
    logger.debug(
      `Directory ${fileSize / 1000000}MB received in ${
        end - start
      } ms, speed: ${speed} MB/s`,
    );
  });
}
