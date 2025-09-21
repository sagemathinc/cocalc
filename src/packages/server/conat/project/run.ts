/*
DEV

 Turn off in the hub by sending this message from a browser as an admin:

   await cc.client.conat_client.hub.system.terminate({service:'project-runner'})

Then start this in nodejs

   require('@cocalc/project-runner/conat/project/run').init()
*/

import { init as initProjectRunner } from "@cocalc/project-runner/run";
import { loadConatConfiguration } from "../configuration";
import { conat } from "@cocalc/backend/conat";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:project:run");

const servers: any[] = [];
export async function init(count: number = 1) {
  logger.debug("init project runner(s)", { count });
  await loadConatConfiguration();
  const client = conat();
  for (let i = 0; i < count; i++) {
    const server = await initProjectRunner({ client, id: `${i}` });
    servers.push(server);
  }
}

export function close() {
  for (const server of servers) {
    server.close();
  }
  servers.length = 0;
}
