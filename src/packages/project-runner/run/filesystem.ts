import {
  client as createFileClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { sshServer as defaultSshServer } from "@cocalc/backend/data";

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

// where files are stored
export async function localPath({
  project_id,
}: {
  project_id: string;
}): Promise<string> {
  const c = getFsClient();
  const { path } = await c.mount({ project_id });
  return path;
}

// default sshServer if you don't specify something explicitly when calling
// init in project-runner/run/index.ts
// This is what gets configured with defaults or via the COCALC_SSH_SERVER
// env variable in backend/data.  Again, this is what would work in dev
// mode when everything is on the same computer.
export async function sshServers({ project_id }: { project_id: string }) {
  const { name, host, port } = defaultSshServer;
  return [{ name, host, port, user: `project-${project_id}` }];
}
