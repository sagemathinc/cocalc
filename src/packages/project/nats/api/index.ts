/*
How to do development (so in a dev project doing cc-in-cc dev).

0. From the browser, terminate this api server running in the project already, if any

    await cc.client.nats_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'}).terminate()

1. Open a terminal in the project itself, which sets up the required environment variables, e.g.,

    - COCALC_NATS_JWT -- this has the valid JWT issued to grant the project rights to use nats
    - COCALC_PROJECT_ID

You can type the following into the miniterminal in a project and copy the output into a terminal here to
setup the same environment and make starting this server act like this part of a project.

    export | grep -E "COCALC|HOME"

2. Do this:

    echo 'require("@cocalc/project/nats/api/index").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

or just run node and paste

    require("@cocalc/project/nats/api").init()

if you want to easily be able to grab some state, e.g., global.x = {...} in some code.

5. Use the browser to see the project is on nats and works:

    a = cc.client.nats_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'});
    await a.system.ping();
    await a.system.exec({command:'echo $COCALC_PROJECT_ID'});

*/

import { JSONCodec } from "nats";
import getLogger from "@cocalc/backend/logger";
import { type ProjectApi } from "@cocalc/nats/project-api";
import { getConnection } from "@cocalc/backend/nats";
import { project_id } from "@cocalc/project/data";

const logger = getLogger("project:nats:api");

const jc = JSONCodec();

export async function init() {
  const subject = `project.${project_id}.api`;
  logger.debug(`initAPI -- subject='${subject}', options=`, {
    queue: "0",
  });
  const nc = await getConnection();
  const sub = nc.subscribe(subject, { queue: "0" });
  for await (const mesg of sub) {
    const request = jc.decode(mesg.data) ?? ({} as any);
    if (request.name == "terminate") {
      // special hook so admin can terminate handling. This is useful for development.
      mesg.respond(jc.encode({ status: "terminating" }));
      return;
    }
    handleApiRequest(request, mesg);
  }
}

async function handleApiRequest(request, mesg) {
  let resp;
  try {
    const { name, args } = request as any;
    logger.debug("handling project.api request:", { name });
    resp = (await getResponse({ name, args })) ?? null;
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import * as system from "./system";

export const projectApi: ProjectApi = {
  system,
};

async function getResponse({ name, args }) {
  const [group, functionName] = name.split(".");
  const f = projectApi[group]?.[functionName];
  if (f == null) {
    throw Error(`unknown function '${name}'`);
  }
  return await f(...args);
}
