/*
This is a very lightweight small subset of the hub's API for browser clients.
*/

import getLogger from "@cocalc/backend/logger";
import { type HubApi, transformArgs } from "@cocalc/conat/hub/api";
import userQuery, { init as initUserQuery } from "./user-query";
import { account_id as ACCOUNT_ID } from "@cocalc/backend/data";
import {
  FALLBACK_PROJECT_UUID,
  FALLBACK_ACCOUNT_UUID,
} from "@cocalc/util/misc";
import { callRemoteHub, hasRemote, project_id } from "../remote";

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

function fallbackNames(account_ids: Set<string>): {
  [id: string]: { first_name: string; last_name: string };
} {
  const names: { [id: string]: { first_name: string; last_name: string } } = {};
  if (account_ids.has(FALLBACK_PROJECT_UUID)) {
    names[FALLBACK_PROJECT_UUID] = {
      first_name: "CoCalc",
      last_name: "Project",
    };
  }
  if (account_ids.has(FALLBACK_ACCOUNT_UUID)) {
    names[FALLBACK_ACCOUNT_UUID] = { first_name: "CoCalc", last_name: "User" };
  }
  if (account_ids.has(ACCOUNT_ID)) {
    names[ACCOUNT_ID] = { first_name: "CoCalc", last_name: "User" };
  }
  if (account_ids.has(project_id)) {
    // TODO: get the actual project title (?).
    names[project_id] = { first_name: "Remote", last_name: "Project" };
  }
  return names;
}

async function getNames(account_ids: string[]) {
  const x = fallbackNames(new Set(account_ids));
  if (!hasRemote) {
    return x;
  }
  const names = await callRemoteHub({
    name: "system.getNames",
    args: [account_ids],
  });
  return { ...names, ...x };
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
