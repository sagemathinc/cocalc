/*

*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type BrowserApi } from "@cocalc/nats/browser-api";
import { browserSubject } from "@cocalc/nats/names";

export async function initApi() {
  console.log("init nats browser api - x");
  const sessionId = webapp_client.nats_client.sessionId;
  if (!webapp_client.account_id) {
    throw Error("must be signed in");
  }
  const subject = browserSubject({
    account_id: webapp_client.account_id,
    sessionId,
    service: "api",
  });
  console.log({ subject });
  console.log("init browser API", { sessionId, subject });
  const { jc, nc } = await webapp_client.nats_client.getEnv();
  const subscription = nc.subscribe(subject);
  listen({ subscription, jc });
}

async function listen({ subscription, jc }) {
  for await (const mesg of subscription) {
    const request = jc.decode(mesg.data);
    handleApiRequest({ request, mesg, jc });
  }
}

async function handleApiRequest({ request, mesg, jc }) {
  let resp;
  try {
    const { name, args } = request as any;
    console.log("handling browser.api request:", { name });
    resp = (await getResponse({ name, args })) ?? null;
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import * as system from "./system";

export const browserApi: BrowserApi = {
  system,
};

async function getResponse({ name, args }) {
  const [group, functionName] = name.split(".");
  const f = browserApi[group]?.[functionName];
  if (f == null) {
    throw Error(`unknown function '${name}'`);
  }
  return await f(...args);
}
