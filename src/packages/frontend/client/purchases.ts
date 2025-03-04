/*
Functions for interfacing with the purchases functionality.

TODO/DEPRECATE: this module is mostly pointless since I moved essentially
all of this code to @cocalc/frontend/purchases/api, which is much better
since it can also be used directly by our nextjs app, and also is
scoped better.  That said quotaModal is here.
*/

import type { Service } from "@cocalc/util/db-schema/purchases";
import { redux } from "@cocalc/frontend/app-framework";
import { once } from "@cocalc/util/async-utils";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import * as purchasesApi from "@cocalc/frontend/purchases/api";
import type { Changes as EditLicenseChanges } from "@cocalc/util/purchases/cost-to-edit-license";
import { round2up } from "@cocalc/util/misc";
import type { WebappClient } from "./client";

export class PurchasesClient {
  api: typeof purchasesApi;
  client: WebappClient;

  constructor(client: WebappClient) {
    this.api = purchasesApi;
    this.client = client;
  }
  async getQuotas(): Promise<{
    minBalance: number;
    services: { [service: string]: number };
  }> {
    return await purchasesApi.getQuotas();
  }

  async getBalance(): Promise<number> {
    return await this.client.nats_client.hub.purchases.getBalance();
  }

  async getSpendRate(): Promise<number> {
    return await purchasesApi.getSpendRate();
  }

  async getClosingDates(): Promise<{ last: Date; next: Date }> {
    return await purchasesApi.getClosingDates();
  }

  async setQuota(
    service: Service,
    value: number,
  ): Promise<{ global: number; services: { [service: string]: number } }> {
    return await purchasesApi.setQuota(service, value);
  }

  async isPurchaseAllowed(
    service: Service,
    cost?: number,
  ): Promise<{ allowed: boolean; reason?: string; chargeAmount?: number }> {
    return await purchasesApi.isPurchaseAllowed(service, cost);
  }

  async getPurchases(opts: {
    thisMonth?: boolean; // if true, limit and offset are ignored
    limit?: number;
    offset?: number;
    service?: Service;
    project_id?: string;
    group?: boolean;
  }) {
    return await purchasesApi.getPurchases(opts);
  }

  async editLicense(opts: { license_id: string; changes: EditLicenseChanges }) {
    return await purchasesApi.editLicense(opts);
  }

  async getInvoice(invoice_id: string) {
    return await purchasesApi.getInvoice(invoice_id);
  }

  async getCostPerDay(opts: { limit?: number; offset?: number }) {
    return await purchasesApi.getCostPerDay(opts);
  }

  async quotaModal({
    service,
    cost,
    allowed,
    reason,
    cost_per_hour,
  }: {
    service?: Service;
    // cost = how much you have to have available in your account
    cost?: number;
    allowed?: boolean;
    reason?: string;
    // the rate if this is a pay-as-you-go metered purchase.
    cost_per_hour?: number;
  } = {}): Promise<void> {
    const actions = redux.getActions("billing");
    actions.setState({
      pay_as_you_go: {
        showModal: true,
        service,
        cost: cost != null ? round2up(cost) : cost,
        reason,
        allowed,
        cost_per_hour,
      } as any,
    });
    await waitUntilPayAsYouGoModalCloses();
  }

  async getCustomer() {
    return await purchasesApi.getCustomer();
  }

  async getChargesByService() {
    return await purchasesApi.getChargesByService();
  }

  async getCurrentCheckoutSession() {
    return await purchasesApi.getCurrentCheckoutSession();
  }

  async getUnpaidInvoices(): Promise<any[]> {
    return await purchasesApi.getUnpaidInvoices();
  }

  async getServiceCost(service: Service): Promise<any> {
    return await purchasesApi.getServiceCost(service);
  }

  async getMinimumPayment(): Promise<number> {
    return await purchasesApi.getMinimumPayment();
  }

  async setPayAsYouGoProjectQuotas(project_id: string, quota: ProjectQuota) {
    await purchasesApi.setPayAsYouGoProjectQuotas(project_id, quota);
  }

  async getPayAsYouGoMaxProjectQuotas(): Promise<ProjectQuota> {
    return await purchasesApi.getPayAsYouGoMaxProjectQuotas();
  }

  async getPayAsYouGoPricesProjectQuotas(): Promise<{
    cores: number;
    disk_quota: number;
    memory: number;
    member_host: number;
  }> {
    return await purchasesApi.getPayAsYouGoPricesProjectQuotas();
  }

  // this is only used in the nextjs store app right now...
  async getShoppingCartCheckoutParams() {
    return await purchasesApi.getShoppingCartCheckoutParams();
  }

  async adminGetMinBalance(account_id: string): Promise<number> {
    return await purchasesApi.adminGetMinBalance(account_id);
  }

  async adminSetMinBalance(account_id: string, minBalance: number) {
    await purchasesApi.adminSetMinBalance(account_id, minBalance);
  }

  async getLicense(license_id: string) {
    return await purchasesApi.getLicense({ license_id });
  }

  async renewSubscription(
    subscription_id: number,
  ): Promise<{ purchase_id: number | null }> {
    return await purchasesApi.renewSubscription(subscription_id);
  }

  async getLiveSubscriptions() {
    return await purchasesApi.getLiveSubscriptions();
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
