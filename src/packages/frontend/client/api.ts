/*
Use the api v2 endpoint from the app frontend.  This is everything defined
in @cocalc/next/pages/api/v2

We always use POST requests here.

The v1 api is also exported here.

This doesn't know anything about types, etc.
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default async function api(endpoint: string, args?: object) {
  return await callApi(join("v2", endpoint), args);
}

// also the old v1 api
export async function v1(endpoint: string, args?: object) {
  return await callApi(join("v1", endpoint), args);
}

async function callApi(endpoint: string, args?: object) {
  const url = join(appBasePath, "api", endpoint);
  const resp = await (
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...(args != null ? { body: JSON.stringify(args) } : undefined),
    })
  ).json();
  if (resp == null) {
    throw Error("timeout -- please try again");
  }
  if (resp.error) {
    throw Error(resp.error);
  }
  return resp;
}
