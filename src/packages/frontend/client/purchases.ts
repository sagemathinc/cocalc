/*
Functions for interfacing with the purchases functionality.
*/
// import type { WebappClient } from "./client";

// TODO: refactor with components/run-button/api.ts
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default async function api(endpoint: string, args?: object) {
  const url = join(appBasePath, "api/v2", endpoint);
  const resp = await (
    await fetch(url, {
      method: args != null ? "POST" : "GET",
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

export class PurchasesClient {
  //private client: WebappClient;

  //   constructor(client: WebappClient) {
  //     this.client = client;
  //   }

  // Returns quotas for each category of purchase, along with
  // a 'global' quota.
  async getQuotas(): Promise<{ [name: string]: number }> {
    return await api("purchases/get-quotas");
  }

  async setQuota(name: string, value: number): Promise<void> {
    await api("purchases/set-quota", { name, value });
  }
}
