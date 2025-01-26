/*


 echo "require('@cocalc/database/nats').init()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node

*/

import getLogger from "@cocalc/backend/logger";
import { JSONCodec } from "nats";
import { isValidUUID } from "@cocalc/util/misc";
import userQuery from "@cocalc/database/user-query";
import { getConnection } from "@cocalc/backend/nats";

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
    const segments = mesg.subject.split(".");
    const uuid = segments[2];
    if (!isValidUUID(uuid)) {
      throw Error(`invalid uuid '${uuid}'`);
    }
    const type = segments[1]; // 'project' or 'account'
    let account_id, project_id;
    if (type == "project") {
      project_id = uuid;
      account_id = undefined;
    } else if (type == "account") {
      project_id = undefined;
      account_id = uuid;
    } else {
      throw Error("must be project or account");
    }
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
