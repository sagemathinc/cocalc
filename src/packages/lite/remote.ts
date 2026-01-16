/*
Optional remote hub wiring for lite mode.

When REMOTE_HUB is set, lite can call a remote hub via Conat and optionally
proxy /conat-remote websocket upgrades.
*/

import callHub from "@cocalc/conat/hub/call-hub";
import { initProxy } from "./hub/proxy";
import { connectToConat } from "@cocalc/project/conat/connection";
import getLogger from "@cocalc/backend/logger";
import type { Client as ConatClient } from "@cocalc/conat/core/client";

const logger = getLogger("lite:remote");

const REMOTE_HUB = process.env.REMOTE_HUB;
// this env variable is sensitive and we don't want it to leak:
delete process.env.REMOTE_HUB;

export const hasRemote = !!REMOTE_HUB;
export let project_id = "";

let client: ConatClient | null = null;
let initPromise: Promise<void> | null = null;

function parseRemoteHub(remoteHub: string): { address: string; apiKey: string } {
  const url = new URL(remoteHub);
  const apiKey = url.searchParams.get("apiKey");
  const address = url.origin + (url.pathname.length > 1 ? url.pathname : "");
  if (!address) {
    throw Error("REMOTE_HUB address must be set");
  }
  if (!apiKey) {
    throw Error("REMOTE_HUB apiKey must be set");
  }
  return { address, apiKey };
}

async function ensureClient(): Promise<void> {
  if (!hasRemote || client != null) {
    return;
  }
  if (initPromise == null) {
    initPromise = (async () => {
      const { address, apiKey } = parseRemoteHub(REMOTE_HUB!);
      client = connectToConat({ address, apiKey });
      await client.waitUntilSignedIn();
      project_id = client.info?.user?.project_id ?? "";
    })();
  }
  await initPromise;
}

export async function init({
  httpServer,
  path,
}: {
  httpServer: any;
  path?: string;
}) {
  if (!hasRemote) {
    return;
  }
  const { address, apiKey } = parseRemoteHub(REMOTE_HUB!);
  logger.debug("start remote hub --> ", { address, path });
  if (client == null) {
    client = connectToConat({ address, apiKey });
    await client.waitUntilSignedIn();
    project_id = client.info?.user?.project_id ?? "";
  }
  initProxy({
    httpServer,
    apiKey,
    address,
  });
}

export async function callRemoteHub({
  name,
  args,
  timeout,
}: {
  name: string;
  args?: any[];
  timeout?: number;
}) {
  await ensureClient();
  if (client == null) {
    throw Error("remote not configured");
  }
  return await callHub({
    client,
    project_id,
    name,
    args,
    timeout,
  });
}
