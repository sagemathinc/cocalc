/*
Health check for use in Kubernetes.
*/

import type { ConatServer } from "@cocalc/conat/core/server";
import { conatClusterHealthPort } from "@cocalc/backend/data";
import { createServer } from "http";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("conat:socketio:health");

export async function health(server: ConatServer) {
  logger.debug(
    `starting /health socketio server on port ${conatClusterHealthPort}`,
  );
  const healthServer = createServer();
  healthServer.listen(conatClusterHealthPort);
  healthServer.on("request", (req, res) => {
    if (req.method === "GET") {
      if (server.isHealthy()) {
        res.statusCode = 200;
        res.end("healthy");
      } else {
        res.statusCode = 500;
        res.end("Unhealthy");
      }
    }
  });
}
