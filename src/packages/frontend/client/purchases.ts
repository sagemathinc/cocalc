/*
Functions for interfacing with the purchases functionality.
*/
// import type { WebappClient } from "./client";

import api from "./api";

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
