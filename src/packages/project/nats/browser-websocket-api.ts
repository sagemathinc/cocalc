/*
Implement the same protocol as browser-websocket was built on using primus,
but instead using NATS.

How to do development (so in a dev project doing cc-in-cc dev):

0. From the browser, send a terminate-handler message, so the handler running in the project stops:

    await cc.client.nats_client.projectWebsocketApi({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094', mesg:{cmd:"terminate"}})

1. Open a terminal in the project itself, which sets up the required environment variables, e.g.,
    - COCALC_NATS_JWT -- this has the valid JWT issued to grant the project rights to use nats
    - COCALC_PROJECT_ID

2. cd to your dev packages/project source code, e.g., ../cocalc/src/packages/project

3. Do this:

     echo 'require("@cocalc/project/client").init(); require("@cocalc/project/nats/browser-websocket-api").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

4. Use the browser to see the project is on nats and works:

    await cc.client.nats_client.projectWebsocketApi({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094', mesg:{cmd:"listing"}})

5. In a terminal you can always tap into the message stream for a particular project (do `pnpm nats-shell` if necessary to setup your environment):

   nats sub --match-replies project.56eb622f-d398-489a-83ef-c09f1a1e8094.browser-api

*/

import { getLogger } from "@cocalc/project/logger";
import { JSONCodec } from "nats";
import { project_id } from "@cocalc/project/data";
import getConnection from "./connection";
import { handleApiCall } from "@cocalc/project/browser-websocket/api";

const logger = getLogger("project:nats:browser-websocket-api");

const jc = JSONCodec();

export async function init() {
  const nc = await getConnection();
  const subject = `project.${project_id}.browser-api`;
  logger.debug(`initAPI -- NATS project subject '${subject}'`);
  const sub = nc.subscribe(subject);
  for await (const mesg of sub) {
    const data = jc.decode(mesg.data) ?? ({} as any);
    if (data.cmd == "terminate") {
      logger.debug(
        "received terminate-handler, so will not handle any further messages",
      );
      mesg.respond(jc.encode({ exiting: true }));
      return;
    }
    handleRequest(data, mesg);
  }
}

async function handleRequest(data, mesg) {
  let resp;
  logger.debug("received cmd:", data?.cmd);
  const spark = {} as any;
  const primus = {} as any;
  try {
    resp = await handleApiCall({ data, spark, primus });
  } catch (err) {
    resp = { error: `${err}` };
  }
  //logger.debug("responded", resp);
  mesg.respond(jc.encode(resp));
}
