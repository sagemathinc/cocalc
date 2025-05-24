/*
Implement the same protocol as browser-websocket was built on using primus,
but instead using NATS.

How to do development (so in a dev project doing cc-in-cc dev):

0. From the browser, send a terminate-handler message, so the handler running in the project stops:

    await cc.client.conat_client.projectWebsocketApi({project_id:cc.current().project_id, mesg:{cmd:"terminate"}})

1. Open a terminal in the project itself, which sets up the required environment variables.  See api/index.ts for details!!

2. cd to your dev packages/project source code, e.g., ../cocalc/src/packages/project

3. Do this:

     echo 'require("@cocalc/project/client").init(); require("@cocalc/project/conat/browser-websocket-api").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

Or just run node then paste in

     require("@cocalc/project/client").init(); require("@cocalc/project/conat/browser-websocket-api").init()

A nice thing about doing that is if you write this deep in some code:

      global.x = { t: this };

then after that code runs you can access x from the node console!

4. Use the browser to see the project is on conat and works:

    await cc.client.conat_client.projectWebsocketApi({project_id:'56eb622f-d398-489a-83ef-c09f1a1e8094', mesg:{cmd:"listing"}})

5. In a terminal you can always tap into the message stream for a particular project:

   cd packages/backend
   pnpm conat-watch project.56eb622f-d398-489a-83ef-c09f1a1e8094.browser-api --match-replies

*/

import { getLogger } from "@cocalc/project/logger";
import getConnection, { connectToConat } from "./connection";
import { handleApiCall } from "@cocalc/project/browser-websocket/api";
import { getPrimusConnection } from "@cocalc/conat/primus";
import { getSubject } from "./names";

const logger = getLogger("project:nats:browser-websocket-api");

export async function init() {
  const nc = await getConnection();
  const cn = connectToConat();
  const subject = getSubject({
    service: "browser-api",
  });
  logger.debug(`initAPI -- NATS project subject '${subject}'`);
  const sub = await cn.subscribe(subject);
  const primus = getPrimusConnection({
    subject: getSubject({
      service: "primus",
    }),
    env: { nc, jc: null as any, cn },
    role: "server",
    id: "project",
  });
  for await (const mesg of sub) {
    const data = mesg.data ?? ({} as any);
    if (data.cmd == "terminate") {
      logger.debug(
        "received terminate-handler, so will not handle any further messages",
      );
      mesg.respond({ exiting: true });
      return;
    }
    handleRequest({ data, mesg, primus });
  }
}

async function handleRequest({ data, mesg, primus }) {
  let resp;
  logger.debug("received cmd:", data?.cmd);
  try {
    resp = await handleApiCall({ data, spark: {} as any, primus });
  } catch (err) {
    resp = { error: `${err}` };
  }
  //logger.debug("responded", resp);
  mesg.respond(resp ?? null);
}
