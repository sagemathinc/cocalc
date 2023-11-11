/*
Send files over a websocket to a remote server
*/

import getLogger from "@cocalc/backend/logger";
const logger = getLogger("sync-fs:send-files");

import { spawn } from "child_process";

export default function sendFiles({
  ws,
  HOME = process.env.HOME,
}: {
  ws;
  HOME?;
}) {
  let start = Date.now();
  // TODO: 'foo' is just a demo
  const tar = spawn("tar", ["-I", "lz4", "-c", "foo"], {
    cwd: HOME,
  });
  logger.debug("got connection", start);
  let fileSize = 0;

  // TODO: here we would wait for a message listing files we should send
  // or maybe that is just input to this function
  logger.debug("Sending files...");

  tar.stdout.on("data", (data) => {
    fileSize += data.length;
    // logger.debug("sending ", data.length, "bytes");
    ws.send(data);
  });

  tar.stdout.on("end", () => {
    let end = Date.now();
    let timeTaken = (end - start) / 1000; // convert ms to s
    let speed = fileSize / timeTaken / 1000000;
    logger.debug(
      `Directory ${fileSize / 1000000}MB sent in ${
        end - start
      } ms, speed: ${speed} MB/s`,
    );
    ws.close();
  });
}
