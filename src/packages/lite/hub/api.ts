/*
This is a very lightweight small subset of the hub's API for browser clients.
*/

import getLogger from "@cocalc/backend/logger";
import { type HubApi, transformArgs } from "@cocalc/conat/hub/api";
import { conat } from "@cocalc/backend/conat";
import userQuery, { init as initUserQuery } from "./user-query";
import { account_id as ACCOUNT_ID } from "@cocalc/backend/data";

const logger = getLogger("lite:hub:api");

export async function init() {
  const subject = "hub.*.*.api";
  logger.debug(`init -- subject='${subject}', options=`, {
    queue: "0",
  });
  const cn = await conat({ noCache: true });
  await initUserQuery(cn);
  const api = await cn.subscribe(subject, { queue: "0" });
  for await (const mesg of api) {
    (async () => {
      try {
        await handleMessage(mesg);
      } catch (err) {
        logger.debug(`WARNING: unexpected error  - ${err}`);
      }
    })();
  }
}

async function handleMessage(mesg) {
  const request = mesg.data ?? ({} as any);
  let resp, headers;
  try {
    const { account_id, project_id } = {
      account_id: ACCOUNT_ID,
      project_id: undefined,
    };
    const { name, args } = request as any;
    logger.debug("handling hub.api request:", {
      account_id,
      project_id,
      name,
    });
    resp = (await getResponse({ name, args, account_id, project_id })) ?? null;
    headers = undefined;
  } catch (err) {
    resp = null;
    headers = {
      error: err.message ? err.message : `${err}`,
      error_attrs: { code: err.code, subject: err.subject },
    };
  }
  try {
    await mesg.respond(resp, { headers });
  } catch (err) {
    // there's nothing we can do here, e.g., maybe NATS just died.
    logger.debug(
      `WARNING: error responding to hub.api request (client will receive no response) -- ${err}`,
    );
  }
}

export const hubApi: HubApi = {
  system: {},
  projects: {},
  db: { userQuery },
  purchases: {},
  jupyter: {},
} as any;

async function getResponse({ name, args, account_id, project_id }) {
  const [group, functionName] = name.split(".");
  const f = hubApi[group]?.[functionName];
  if (f == null) {
    throw Error(`not implemented function '${name}'`);
  }
  const args2 = await transformArgs({
    name,
    args,
    account_id,
    project_id,
  });
  return await f(...args2);
}
