import {
  client as createFileClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

//import getLogger from "@cocalc/backend/logger";

// const logger = getLogger("project-runner:filesystem");

let client: ConatClient | null = null;
export function init(opts: { client: ConatClient }) {
  client = opts.client;
}

let fsclient: Fileserver | null = null;
function getFsClient() {
  if (client == null) {
    throw Error("client not initialized");
  }
  fsclient ??= createFileClient({ client });
  return fsclient;
}

export async function setQuota(project_id: string, size: number | string) {
  const c = getFsClient();
  await c.setQuota({ project_id, size });
}

export async function mountHome(project_id: string): Promise<string> {
  const c = getFsClient();
  const { path } = await c.mount({ project_id });
  return path;
}
