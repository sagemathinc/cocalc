/*
Functions for interfacing with the purchases functionality.
*/
// import type { WebappClient } from "./client";

import api from "./api";
import type { Service } from "@cocalc/util/db-schema/purchases";
import { redux } from "@cocalc/frontend/app-framework";
import { once } from "@cocalc/util/async-utils";

export class PurchasesClient {
  //private client: WebappClient;

  //   constructor(client: WebappClient) {
  //     this.client = client;
  //   }

  // Returns quotas for each category of purchase, along with
  // a 'global' quota.
  async getQuotas(): Promise<{
    global: number;
    services: { [service: string]: number };
  }> {
    return await api("purchases/get-quotas");
  }

  // returns the quotas after being changed.
  async setQuota(
    service: Service,
    value: number
  ): Promise<{ global: number; services: { [service: string]: number } }> {
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

  async quotaModal({
    service,
    cost,
    allowed,
    reason,
  }: {
    service?: Service;
    cost?: number;
    allowed?: boolean;
    reason?: string;
  } = {}): Promise<void> {
    const actions = redux.getActions("billing");
    actions.setState({
      pay_as_you_go: { showModal: true, service, cost, reason, allowed } as any,
    });
    await waitUntilPayAsYouGoModalCloses();
  }
}

async function waitUntilPayAsYouGoModalCloses() {
  const store = redux.getStore("billing");
  while (true) {
    await once(store, "change");
    if (!store.getIn(["pay_as_you_go", "showModal"])) {
      return;
    }
  }
}
