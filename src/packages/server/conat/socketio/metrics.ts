/*
Metrics endpoint for use in Kubernetes.
*/

import { delay } from "awaiting";
import type { IncomingMessage, ServerResponse } from "http";
import { Gauge, register } from "prom-client";

import { getLogger } from "@cocalc/backend/logger";
import type { ConatServer } from "@cocalc/conat/core/server";
import { Metrics } from "@cocalc/conat/types";

const logger = getLogger("conat:socketio:metrics");

const DELAY_MS = 10_000;

const usageMetric = new Gauge({
  name: "cocalc_conat_usage",
  help: "Conat server usage metrics",
  labelNames: ["event", "value"],
});

// periodically grab the metrics and set the Gauge, avoids an event emitter callback memory leak
export async function initMetrics(server: ConatServer) {
  logger.debug("metrics endpoint initialized");

  await delay(DELAY_MS);
  while (server.state != "closed") {
    try {
      const usage: Metrics = server.getUsage();
      if (usage) {
        for (const [key, val] of Object.entries(usage)) {
          const [event, value] = key.split(":");
          usageMetric.set({ event, value }, val);
        }
      }
    } catch (err) {
      logger.debug(`WARNING: error retrieving metrics -- ${err}`);
    }
    await delay(DELAY_MS);
  }
}

export async function handleMetrics(
  _req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const metricsData = await register.metrics();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.statusCode = 200;
    res.end(metricsData);
  } catch (error) {
    logger.error("Error getting metrics:", error);
    res.statusCode = 500;
    res.end("Internal server error");
  }
}
