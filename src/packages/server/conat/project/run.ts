/*
DEV

 Turn off in the hub by sending this message from a browser as an admin:

   await cc.client.conat_client.hub.system.terminate({service:'project-runner'})

Then start this in nodejs

   require('@cocalc/project-runner/conat/project/run').init()
*/

import {
  init as initProjectRunner,
  close as killAllProjects,
} from "@cocalc/project-runner/run";
import { loadConatConfiguration } from "../configuration";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:project:run");

const servers: any[] = [];
export async function init(count: number = 1) {
  const opts = { runtime: "nsjail" as "nsjail" };
  logger.debug("init project runner(s)", { count, opts });
  await loadConatConfiguration();
  for (let i = 0; i < count; i++) {
    const server = await initProjectRunner(opts);
    servers.push(server);
  }
}

export function close() {
  killAllProjects();
  for (const server of servers) {
    server.close();
  }
  servers.length = 0;
}
