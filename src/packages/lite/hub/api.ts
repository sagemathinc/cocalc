/*
This is a very lightweight small subset of the hub's API for browser clients.
*/

import getLogger from "@cocalc/backend/logger";
import { type HubApi, transformArgs } from "@cocalc/conat/hub/api";
import userQuery, { init as initUserQuery } from "./user-query";
import { account_id as ACCOUNT_ID } from "@cocalc/backend/data";
import { callRemoteHub, hasRemote } from "../remote";

const logger = getLogger("lite:hub:api");

export async function init({ client }) {
  const subject = "hub.*.*.api";
  logger.debug(`init -- subject='${subject}', options=`, {
    queue: "0",
  });
  await initUserQuery(client);
  const api = await client.subscribe(subject, { queue: "0" });
  listen(api);
}

async function listen(api) {
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

async function getNames(account_ids: string[]) {
  if (hasRemote) {
    const names = await callRemoteHub({
      name: "system.getNames",
      args: [account_ids],
    });
    if (account_ids.includes(ACCOUNT_ID)) {
      // TODO when we define local config or mapping to upstream account (?).
      names[ACCOUNT_ID] = { first_name: "CoCalc", last_name: "User" };
    }
    return names;
  } else {
    // this is all we know
    return { [ACCOUNT_ID]: { first_name: "CoCalc", last_name: "User" } };
  }
}

export const hubApi: HubApi = {
  system: { getNames },
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
