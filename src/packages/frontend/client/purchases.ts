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
    global: {
      quota: number;
      why: string;
      increase: string;
    };
    services: { [service: string]: number };
  }> {
    return await api("purchases/get-quotas");
  }

  async getBalance(): Promise<number> {
    return await api("purchases/get-balance");
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
    service?: Service;
    project_id?: string;
    group?: boolean;
  }) {
    return await api("purchases/get-purchases", opts);
  }

  async getCostPerDay(opts: { limit?: number; offset?: number }) {
    return await api("purchases/get-cost-per-day", opts);
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

  // Get all the stripe payment info about a given user.
  async getPaymentMethods() {
    return await api("billing/get-payment-methods");
  }

  // Get all the stripe information about a given user.
  async getCustomer() {
    return await api("billing/get-customer");
  }

  // Get the global purchase quota of user with given account_id.  This is only
  // for use by admins.  This quota is computed via rules, and may be overridden
  // based on the adminSetQuota below, but usually isn't.
  async adminGetQuota(account_id: string): Promise<{
    quota: number;
    why: string;
    increase: string;
  }> {
    return await api("purchases/admin-get-quota", { account_id });
  }

  // Set the override global purchase quota of user with given account_id.  This is only
  // for use by admins.
  async adminSetQuota(account_id: string, purchase_quota: number) {
    await api("user-query", {
      query: { crm_accounts: { account_id, purchase_quota } },
    });
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
