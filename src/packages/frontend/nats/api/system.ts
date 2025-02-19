import { webapp_client } from "@cocalc/frontend/webapp-client";

export async function ping() {
  return { now: Date.now(), sessionId: webapp_client.nats_client.sessionId };
}

import { version as versionNumber } from "@cocalc/util/smc-version";
export async function version() {
  return versionNumber;
}
