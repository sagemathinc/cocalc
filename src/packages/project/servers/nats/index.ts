/*
Run for a project_id you want to simulate:

    export HOME=...  # (optional)
    export COCALC_PROJECT_ID='81e0c408-ac65-4114-bad5-5f4b6539bd0e'
    echo 'require("@cocalc/project/servers/nats").default()' | node
    
then in the browser:

    await cc.client.nats_client.project({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e', endpoint:"exec", params:{command:'echo $COCALC_PROJECT_ID'}})
    
*/

import { getLogger } from "@cocalc/project/logger";
import { connect, JSONCodec } from "nats";
import { project_id } from "@cocalc/project/data";

const logger = getLogger("server:nats");

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc project server");
  const nc = await connect();
  logger.debug(`connected to ${nc.getServer()}`);
  initAPI(nc);
}

const jc = JSONCodec();

export async function initAPI(nc) {
  const subject = `projects.${project_id}.api`;
  logger.debug(`initAPI -- NATS project subject '${subject}'`);
  const sub = nc.subscribe(subject);
  for await (const mesg of sub) {
    handleApiRequest(mesg);
  }
}

async function handleApiRequest(mesg) {
  const request = jc.decode(mesg.data) ?? {};
  let resp;
  try {
    // TODO: obviously user-provided account_id is no good!  This is a POC.
    const { endpoint, params } = request as any;
    logger.debug("handling project request:", { endpoint });
    resp = await getResponse({ endpoint, params });
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import { handleExecShellCode } from "@cocalc/project/exec_shell_code";

async function getResponse({ endpoint, params }) {
  switch (endpoint) {
    case "exec":
      return await handleExecShellCode(params);
    default:
      throw Error(`unknown endpoint '${endpoint}'`);
  }
}
