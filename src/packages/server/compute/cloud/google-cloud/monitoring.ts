/*
Use google cloud monitoring to get the (known) egress network usage
by a specific instance during a particular period of time.
If end time is now, this might be a few minutes off.

NOTE: Google charges us $0.01 for 1000 calls.
*/

import { MetricServiceClient } from "@google-cloud/monitoring";
import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud:monitoring");

interface MonitoringClient extends MetricServiceClient {
  googleProjectId: string;
}
let client: undefined | MonitoringClient = undefined;

export async function getMonitoringClient(): Promise<MonitoringClient> {
  if (client != null) {
    return client;
  }
  const credentials = await getCredentials();
  client = new MetricServiceClient(credentials) as MonitoringClient;
  client.googleProjectId = credentials.projectId;
  return client;
}

// Get the total amount of egress as a floating point value in data
// from the given instance, during the given window of time in unites
// of GiB (=2**30 bytes).
// IMPORTANT: If end is really close to right now, the data simply
// isn't available yet, and the reported egress will be too small.
// I did tests and this is delayed by maybe 3 minutes in tests, but
// I guess in theory it could be delayed by several hours.
export async function getInstanceEgress({
  instanceName,
  start,
  end,
}: {
  instanceName: string;
  start: Date;
  end: Date;
}): Promise<number> {
  logger.debug("getInstanceEgress", { instanceName, start, end });
  const client = await getMonitoringClient();
  const filter = `metric.type="compute.googleapis.com/instance/network/sent_bytes_count" AND metric.labels.instance_name="${instanceName}"`;
  const request = {
    name: client.projectPath(client.googleProjectId),
    filter,
    interval: {
      startTime: {
        seconds: start.valueOf() / 1000,
      },
      endTime: {
        seconds: end.valueOf() / 1000,
      },
    },
    view: "FULL",
  } as const;
  const [result] = await client.listTimeSeries(request);
  let totalBytes = 0;
  for (const ts of result) {
    for (const point of ts.points ?? []) {
      totalBytes += Number(point.value?.int64Value ?? 0);
    }
  }
  logger.debug("getInstanceEgress", { totalBytes });
  return totalBytes / 2 ** 30;
}
