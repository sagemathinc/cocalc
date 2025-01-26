/*


 echo "require('@cocalc/database/nats').init()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node

*/

import getLogger from "@cocalc/backend/logger";
import { JSONCodec } from "nats";
import userQuery from "@cocalc/database/user-query";
import { getConnection } from "@cocalc/backend/nats";
import { getUserId } from "@cocalc/nats/api";

const logger = getLogger("database:nats");

const jc = JSONCodec();

export async function init() {
  const subject = "hub.*.*.db";
  logger.debug(`init -- subject='${subject}', options=`, {
    queue: "0",
  });
  const nc = await getConnection();
  const sub = nc.subscribe(subject, { queue: "0" });
  for await (const mesg of sub) {
    handleRequest(mesg);
  }
}

async function handleRequest(mesg) {
  console.log({ subject: mesg.subject });
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const { name, args } = jc.decode(mesg.data) ?? ({} as any);
    if (!name) {
      throw Error("api endpoint name must be given in message");
    }
    logger.debug("handling hub db request:", {
      account_id,
      project_id,
      name,
      args,
    });
    resp = await getResponse({ name, args, account_id, project_id });
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

async function getResponse({ name, args, account_id, project_id }) {
  if (name == "userQuery") {
    return await userQuery({ ...args[0], account_id, project_id });
  } else {
    throw Error(`name='${name}' not implemented`);
  }
}
