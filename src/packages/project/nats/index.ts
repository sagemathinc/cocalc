/*
How to do development (so in a dev project doing cc-in-cc dev).

1. Open a terminal in the project itself, which sets up the required environment variables, e.g.,
    - COCALC_NATS_JWT -- this has the valid JWT issued to grant the project rights to use nats
    - COCALC_PROJECT_ID
    
2. cd to your dev packages/project source code, e.g., ../cocalc/src/packages/project

3. Do this:
 
     echo 'require("@cocalc/project/nats").default()' | DEBUG=cocalc:* DEBUG_CONSOLE=yes node
    
4. Use the browser to see the project is on nats and works:

    await cc.client.nats_client.project({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e', endpoint:"exec", params:{command:'echo $COCALC_PROJECT_ID'}})
    
*/

import { getLogger } from "@cocalc/project/logger";
import { connect, JSONCodec, jwtAuthenticator } from "nats";
import { project_id } from "@cocalc/project/data";
import { handleExecShellCode } from "@cocalc/project/exec_shell_code";
import { realpath } from "@cocalc/project/browser-websocket/realpath";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc project server");
  if (!process.env.COCALC_NATS_JWT) {
    throw Error("environment variable COCALC_NATS_JWT *must* be set");
  }
  const nc = await connect({
    authenticator: jwtAuthenticator(process.env.COCALC_NATS_JWT),
  });
  logger.debug(`connected to ${nc.getServer()}`);
  initAPI(nc);
}

const jc = JSONCodec();

export async function initAPI(nc) {
  const subject = `project.${project_id}.api.>`;
  logger.debug(`initAPI -- NATS project subject '${subject}'`);
  const sub = nc.subscribe(subject);
  for await (const mesg of sub) {
    handleRequest(mesg, nc);
  }
}

async function handleRequest(mesg, nc) {
  const segments = mesg.subject.split(".");
  const group = segments[3]; // 'owner', 'collaborator', etc.
  const account_id = segments[4];
  await handleApiRequest({ mesg, group, account_id, nc });
}

async function handleApiRequest({ mesg, group, account_id, nc }) {
  const request = jc.decode(mesg.data) ?? {};
  let resp;
  try {
    const { endpoint, params } = request as any;
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

import { createTerminal, restartTerminal, writeToTerminal } from "./terminal";
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
    case "write-to-terminal":
      return writeToTerminal(params);
    default:
      throw Error(`unknown endpoint '${endpoint}'`);
  }
}
