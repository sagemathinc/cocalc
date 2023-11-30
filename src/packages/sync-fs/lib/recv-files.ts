/*
Receive files over a websocket.
*/

import getLogger from "@cocalc/backend/logger";
const logger = getLogger("sync-fs:recv-files");

import { spawn } from "child_process";

export default function recvFiles({
  ws,
  HOME = process.env.HOME,
  args,
}: {
  ws;
  HOME?;
  args: string[];
}) {
  if (args.length == 0) {
    ws.emit("error", "no arguments given");
    ws.close();
    return;
  }
  const tar = spawn("tar", args, {
    cwd: HOME,
  });
  let start = Date.now();
  logger.debug("got connection", start);
  let fileSize = 0;
  ws.on("message", (data) => {
    if (data instanceof Buffer) {
      // logger.debug("received ", data.length, "bytes");
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
      `recvFiles: ${fileSize / 1000000}MB received in ${
        end - start
      } ms, speed: ${speed} MB/s`,
    );
  });
}
