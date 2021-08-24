// The HTTP(S) server, which makes the other servers
// (websocket, proxy, and share) available on the network.

import { getLogger } from "../logger";
import { createServer } from "http";
import { callback } from "awaiting";

export default async function init(host: string) {
  const winston = getLogger("init-http-redirect");
  winston.info(`Creating redirect http://${host} --> https://${host}`);
  const httpServer = createServer((req, res) => {
    res.writeHead(301, {
      Location: "https://" + req.headers["host"] + req.url,
    });
    res.end();
  });
  await callback(httpServer.listen.bind(httpServer), 80, host);
}
