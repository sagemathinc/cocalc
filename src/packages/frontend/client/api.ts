/*
Use the api v2 endpoint from the app frontend.  This is everything defined
in @cocalc/next/pages/api/v2

We always use POST requests here.

The v1 api is also exported here.

This doesn't know anything about types, etc.
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { delay } from "awaiting";
import { trunc } from "@cocalc/util/misc";

export default async function api(endpoint: string, args?: object) {
  return await callApi(join("v2", endpoint), args);
}

// also the old v1 api
export async function v1(endpoint: string, args?: object) {
  return await callApi(join("v1", endpoint), args);
}

// if api call fails (typically 5xx due to a temporary restart of
// backend servers e.g., in kubernetes) we wait RETRY_DELAY_MS, then give
// it NUM_RETRIES many ties before showing the user an error.
// Setting the third numRetriesOnFail argument to 0 below
// can be used to disable this behavior.
// This "api call fails" isn't where you get an error json
// back, but when actually making the request really is
// failing, e.g., due to network or server issues.
const RETRY_DELAY_MS = 3000;
const NUM_RETRIES = 2;

// NOTE: I made this complicated with respClone, so I can see
// what the response is if it is not JSON.
async function callApi(
  endpoint: string,
  args?: object,
  numRetriesOnFail?: number,
) {
  // console.log("callApi", { endpoint, args });
  const url = join(appBasePath, "api", endpoint);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    ...(args != null ? { body: JSON.stringify(args) } : undefined),
  });
  const respClone = resp.clone();
  let json: any = null;
  try {
    json = await resp.json();
  } catch (e) {
    console.log(e);
    const r = await respClone.text();
    console.log(trunc(r, 2000));
    if (numRetriesOnFail != null && numRetriesOnFail == 0) {
      throw Error("API server is down -- try again later");
    }
    numRetriesOnFail = numRetriesOnFail ?? NUM_RETRIES;
    console.log(
      `waiting ${RETRY_DELAY_MS}ms then trying again up to ${numRetriesOnFail} more times`,
    );
    await delay(RETRY_DELAY_MS);
    return await callApi(endpoint, args, numRetriesOnFail - 1);
  }
  if (json == null) {
    throw Error("timeout -- try again later");
  }
  if (typeof json == "object" && json.error) {
    throw Error(json.error);
  }
  if (typeof json == "object" && json.errors) {
    // This is what happens when the api request fails due to schema validation issues.
    // I.e., this is soemthing we only see in dev mode since the schema stuff is disabled in production.
    throw Error(
      `API Schema Error: ${json.message} ${JSON.stringify(json.errors)}`,
    );
  }
  // console.log("got ", json);
  return json;
}
