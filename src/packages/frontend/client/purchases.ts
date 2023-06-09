/*
Functions for interfacing with the purchases functionality.
*/
// import type { WebappClient } from "./client";

import api from "./api";
import type { QuotaSpec } from "@cocalc/util/db-schema/purchase-quotas";
import type { Service } from "@cocalc/util/db-schema/purchases";

export class PurchasesClient {
  //private client: WebappClient;

  //   constructor(client: WebappClient) {
  //     this.client = client;
  //   }

  // Returns quotas for each category of purchase, along with
  // a 'global' quota.
  async getQuotas(): Promise<Partial<QuotaSpec>> {
    return await api("purchases/get-quotas");
  }

  // returns the quotas after being changed.
  async setQuota(service: Service, value: number): Promise<Partial<QuotaSpec>> {
    return await api("purchases/set-quota", { service, value });
  }

  async isPurchaseAllowed(
    service: Service,
    cost?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    return await api("purchases/is-purchase-allowed", { service, cost });
  }

  async getPurchases(opts: {
    limit?: number;
    offset?: number;
    paid?: boolean;
  }) {
    console.log("opts = ", opts);
  }
}
