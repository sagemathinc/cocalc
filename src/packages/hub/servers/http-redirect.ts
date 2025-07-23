// The HTTP(S) server, which makes the other servers
// (websocket, proxy, and share) available on the network.

import { getLogger } from "../logger";
import { createServer } from "http";
import { callback } from "awaiting";
const logger = getLogger("http-redirect");

export default async function init(host: string) {
  logger.info(`Creating redirect http://${host} --> https://${host}`);
  const httpServer = createServer((req, res) => {
    res.writeHead(301, {
      Location: "https://" + req.headers["host"] + req.url,
    });
    res.end();
  });
  httpServer.on("error", (err) => {
    logger.error(`WARNING -- http redirect error: ${err.stack || err}`);
  });
  await callback(httpServer.listen.bind(httpServer), 80, host);
}
