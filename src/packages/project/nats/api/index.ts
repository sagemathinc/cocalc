/*
How to do development (so in a dev project doing cc-in-cc dev).

0. From the browser, terminate this api server running in the project:

    > await cc.client.nats_client.projectApi(cc.current()).system.terminate({service:'api'})

    {status: 'terminated', service: 'api'}

1. Open a terminal in the project itself, which sets up the required environment variables, e.g.,

    - COCALC_NATS_JWT -- this has the valid JWT issued to grant the project rights to use nats
    - COCALC_PROJECT_ID

You can type the following into the miniterminal in a project and copy the output into
a terminal here to setup the same environment and make starting this server act like
this part of a project.

    export | grep -E "COCALC|HOME"

2. Do this:

    echo 'require("@cocalc/project/nats/api/index").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

or just run node and paste

    require("@cocalc/project/nats/api/index").init()

if you want to easily be able to grab some state, e.g., global.x = {...} in some code.

5. Use the browser to see the project is on nats and works:

    a = cc.client.nats_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'});
    await a.system.ping();
    await a.system.exec({command:'echo $COCALC_PROJECT_ID'});

*/

import { JSONCodec } from "nats";
import getLogger from "@cocalc/backend/logger";
import { type ProjectApi } from "@cocalc/nats/project-api";
import getConnection from "@cocalc/project/nats/connection";
import { getSubject } from "../names";
import { terminate as terminateOpenFiles } from "@cocalc/project/nats/open-files";
import { close as closeListings } from "@cocalc/project/nats/listings";
import { Svcm } from "@nats-io/services";
import { compute_server_id, project_id } from "@cocalc/project/data";

const logger = getLogger("project:nats:api");
const jc = JSONCodec();

export async function init() {
  const subject = getSubject({ service: "api" });
  const nc = await getConnection();
  // @ts-ignore
  const svcm = new Svcm(nc);
  const name = `project-${project_id}`;
  logger.debug(`creating API microservice ${name}`);
  const service = await svcm.add({
    name,
    version: "0.1.0",
    description: `CoCalc ${compute_server_id ? "Compute Server" : "Project"}`,
  });
  const api = service.addEndpoint("api", { subject });
  logger.debug(`initAPI -- subscribed to subject='${subject}'`);
  listen(api, subject);
}

async function listen(api, subject) {
  for await (const mesg of api) {
    const request = jc.decode(mesg.data) ?? ({} as any);
    // logger.debug("got message", request);
    if (request.name == "system.terminate") {
      // TODO: should be part of handleApiRequest below, but done differently because
      // one case halts this loop
      const { service } = request.args[0] ?? {};
      if (service == "open-files") {
        terminateOpenFiles();
        mesg.respond(jc.encode({ status: "terminated", service }));
        continue;
      } else if (service == "listings") {
        closeListings();
        mesg.respond(jc.encode({ status: "terminated", service }));
        continue;
      } else if (service == "api") {
        // special hook so admin can terminate handling. This is useful for development.
        console.warn("TERMINATING listening on ", subject);
        logger.debug("TERMINATING listening on ", subject);
        mesg.respond(jc.encode({ status: "terminated", service }));
        api.stop();
        return;
      } else {
        mesg.respond(jc.encode({ error: `Unknown service ${service}` }));
      }
    } else {
      handleApiRequest(request, mesg);
    }
  }
}

async function handleApiRequest(request, mesg) {
  let resp;
  const { name, args } = request as any;
  try {
    // logger.debug("handling project.api request:", { name });
    resp = (await getResponse({ name, args })) ?? null;
  } catch (err) {
    logger.debug(`project.api request err = ${err}`, { name });
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import * as system from "./system";
import * as editor from "./editor";
import * as sync from "./sync";

export const projectApi: ProjectApi = {
  system,
  editor,
  sync,
};

async function getResponse({ name, args }) {
  const [group, functionName] = name.split(".");
  const f = projectApi[group]?.[functionName];
  if (f == null) {
    throw Error(`unknown function '${name}'`);
  }
  return await f(...args);
}
