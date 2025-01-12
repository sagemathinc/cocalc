/* 
This is meant to be similar to the nexts pages http api/v2, but using NATS instead of HTTPS.

To do development turn off for the hub, and run like this:

    echo "require('@cocalc/server/nats').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node

When you make changes, just restart it the above.  All clients will instantly 
use the new version after you restart, and there is no need to restart the hub 
itself or any clients.

To view all requests in realtime:

    nats sub api.v2

and if you want to also see the replies:

    nats sub api.v2 --match-replies 
*/

import { JSONCodec } from "nats";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:nats");

const jc = JSONCodec();

export async function initAPI(nc) {
  logger.debug("initAPI -- NATS api.v2 subject");
  const sub = nc.subscribe("api.v2");
  for await (const mesg of sub) {
    handleApiRequest(mesg);
  }
}

async function handleApiRequest(mesg) {
  const request = jc.decode(mesg.data) ?? {};
  let resp;
  try {
    // TODO: obviously user-provided account_id is no good!  This is a POC.
    const { endpoint, __account_id: account_id, ...params } = request as any;
    logger.debug("handling api.v2 request:", { endpoint });
    resp = await getResponse(endpoint, account_id, params);
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import userQuery from "@cocalc/database/user-query";
import { execute as jupyterExecute } from "@cocalc/server/jupyter/execute";
import getKernels from "@cocalc/server/jupyter/kernels";
import getCustomize from "@cocalc/database/settings/customize";
import callProject from "@cocalc/server/projects/call";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

async function getResponse(endpoint, account_id, params) {
  switch (endpoint) {
    case "customize":
      return await getCustomize(params.fields);
    case "user-query":
      return {
        query: await userQuery({
          ...params,
          account_id,
        }),
      };
    case "exec":
      if (
        !(await isCollaborator({ account_id, project_id: params.project_id }))
      ) {
        throw Error("user must be a collaborator on the project");
      }
      return await callProject({
        account_id,
        project_id: params.project_id,
        mesg: {
          event: "project_exec",
          ...params,
        },
      });
    case "jupyter/execute":
      return {
        ...(await jupyterExecute({ ...params, account_id })),
        success: true,
      };
    case "jupyter/kernels":
      return {
        ...(await getKernels({ ...params, account_id })),
        success: true,
      };

    default:
      throw Error(`unknown endpoint '${endpoint}'`);
  }
}
