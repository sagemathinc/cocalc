import { type Client } from "@cocalc/conat/core/client";
import callHub from "@cocalc/conat/hub/call-hub";
import { initComputeServerProxy } from "./hub/proxy";
import { init as initComputeServer } from "@cocalc/project/conat/compute-server";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("lite:remote");

export const hasRemote = !!process.env.COMPUTE_SERVER;
let client: Client | null = null;
let project_id: string = "";

export async function init({ httpServer, path }) {
  if (!hasRemote) {
    return;
  }
  const url = new URL(process.env.COMPUTE_SERVER!);

  const apiKey = url.searchParams.get("apiKey");
  const address = url.origin + (url.pathname.length > 1 ? url.pathname : "");
  const compute_server_id = parseInt(url.searchParams.get("id") ?? "0");
  logger.debug("start compute server --> ", {
    address,
    compute_server_id,
    path,
  });
  if (!address) {
    throw Error("API_HOST must be set");
  }
  if (!apiKey) {
    throw Error("API_KEY must be set");
  }
  if (!compute_server_id) {
    throw Error("COMPUTE_SERVER_ID must be set");
  }

  console.log(
    `Compute Server: --> ${address}, compute_server_id=${compute_server_id}`,
  );
  ({ client, project_id } = await initComputeServer({
    apiKey,
    address,
    compute_server_id,
    path,
  }));

  initComputeServerProxy({
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
  if (client == null) {
    throw Error("remote not configured");
  }
  return await callHub({ client, project_id, name, args, timeout });
}
