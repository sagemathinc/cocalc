/*
Health check for use in Kubernetes.
*/

import type { ConatServer } from "@cocalc/conat/core/server";
import type { IncomingMessage, ServerResponse } from "http";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("conat:socketio:health");

export function handleHealth(
  server: ConatServer,
  _req: IncomingMessage,
  res: ServerResponse,
) {
  const healthy = server.isHealthy();
  logger.debug("/health reporting conat is healthy=${healthy}");
  if (healthy) {
    res.statusCode = 200;
    res.end("healthy");
  } else {
    res.statusCode = 500;
    res.end("Unhealthy");
  }
}
