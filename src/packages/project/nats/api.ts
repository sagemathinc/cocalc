/*
How to do development (so in a dev project doing cc-in-cc dev).

0. From the browser, terminate this api server running in the project already, if any

    await cc.client.nats_client.project({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e', endpoint:"terminate"})

1. Open a terminal in the project itself, which sets up the required environment variables, e.g.,

    - COCALC_NATS_JWT -- this has the valid JWT issued to grant the project rights to use nats
    - COCALC_PROJECT_ID

You can type the following into the miniterminal in a project and copy the output into a terminal here to
setup the same environment and make starting this server act like this part of a project.

    export | grep -E "COCALC|HOME"

2. Do this:

    echo 'require("@cocalc/project/nats/api").init()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node

or just run node and paste

    require("@cocalc/project/nats/api").init()

if you want to easily be able to grab some state, e.g., global.x = {...} in some code.

5. Use the browser to see the project is on nats and works:

    await cc.client.nats_client.project({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e', endpoint:"exec", params:{command:'echo $COCALC_PROJECT_ID'}})

*/

import { getLogger } from "@cocalc/project/logger";
import { JSONCodec } from "nats";
import { project_id } from "@cocalc/project/data";
import { handleExecShellCode } from "@cocalc/project/exec_shell_code";
import { realpath } from "@cocalc/project/browser-websocket/realpath";
import getConnection from "./connection";

const logger = getLogger("project:nats");

const jc = JSONCodec();

export async function init() {
  const nc = await getConnection();
  const subject = `project.${project_id}.api.>`;
  logger.debug(`initAPI -- NATS project subject '${subject}'`);
  const sub = nc.subscribe(subject);
  for await (const mesg of sub) {
    const request = jc.decode(mesg.data) ?? {} as any;
    if (request.endpoint == "terminate") {
      mesg.respond(jc.encode({ status: "terminate" }));
      // @ts-ignore
      sub.close();
      return;
    }
    handleRequest(request, mesg, nc);
  }
}

async function handleRequest(request, mesg, nc) {
  const segments = mesg.subject.split(".");
  const group = segments[3]; // 'owner', 'collaborator', etc.
  const account_id = segments[4];
  return await handleApiRequest({ request, mesg, group, account_id, nc });
}

async function handleApiRequest({ request, mesg, group, account_id, nc }) {
  let resp;
  try {
    const { endpoint, params } = request;
    logger.debug("handling project request:", {
      endpoint,
      params,
      group,
      account_id,
    });
    resp = await getResponse({ endpoint, params, nc });
  } catch (err) {
    resp = { error: `${err}` };
  }
  logger.debug("responding with ", resp);
  mesg.respond(jc.encode(resp));
}

import {
  createTerminal,
  restartTerminal,
  terminalCommand,
  writeToTerminal,
} from "./terminal";
async function getResponse({ endpoint, params, nc }) {
  switch (endpoint) {
    case "ping":
      return { pong: Date.now() };
    case "realpath":
      return realpath(params.path);
    case "exec":
      return await handleExecShellCode(params);
    case "create-terminal":
      return await createTerminal({ params, nc });
    case "restart-terminal":
      return await restartTerminal(params);
    case "terminal-command":
      return await terminalCommand(params);
    case "write-to-terminal":
      return await writeToTerminal(params);
    default:
      throw Error(`unknown endpoint '${endpoint}'`);
  }
}
