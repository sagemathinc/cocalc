/*
How to do development (so in a dev project doing cc-in-cc dev).

0. From the browser, terminate this api server running in the project:

    > await cc.client.nats_client.projectApi(cc.current()).system.terminate({service:'api'})

    {status: 'terminated', service: 'api'}

1. Create a file project-env.sh, which defines these environment variables (your values will be different):

export COCALC_PROJECT_ID="00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
export COCALC_USERNAME="00847397d6a84cb096a86ef64ac3e6cf"
export HOME="/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/src/data/projects/00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
export DATA=$HOME/.smc


2. Then do this:

    . project-env.sh
    echo 'require("@cocalc/project/nats/api/index").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

or just run node and paste

    require("@cocalc/project/nats/api/index").init()

if you want to easily be able to grab some state, e.g., global.x = {...} in some code.
The project has to be running so that the secret token in $HOME/.smc/secret_token is valid.

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
import { close as closeFilesRead } from "@cocalc/project/nats/files/read";
import { close as closeFilesWrite } from "@cocalc/project/nats/files/write";

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
      } else if (service == "files:read") {
        await closeFilesRead();
        mesg.respond(jc.encode({ status: "terminated", service }));
        continue;
      } else if (service == "files:write") {
        await closeFilesWrite();
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
