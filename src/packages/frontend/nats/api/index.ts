/*

*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type BrowserApi } from "@cocalc/nats/browser-api";
import { Svcm } from "@nats-io/services";
import { browserSubject } from "@cocalc/nats/names";

export async function initApi() {
  const { account_id } = webapp_client;
  if (!account_id) {
    throw Error("must be signed in");
  }
  const { sessionId } = webapp_client.nats_client;
  const { jc, nc } = await webapp_client.nats_client.getEnv();
  // @ts-ignore
  const svcm = new Svcm(nc);
  const subject = browserSubject({
    account_id,
    sessionId,
    service: "api",
  });
  const service = await svcm.add({
    name: `account-${account_id}`,
    version: "0.1.0",
    description: "CoCalc Web Browser",
  });
  const api = service.addEndpoint("api", { subject });
  listen({ api, jc });
}

async function listen({ api, jc }) {
  for await (const mesg of api) {
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
