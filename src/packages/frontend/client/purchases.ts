/*
Functions for interfacing with the purchases functionality.
*/
// import type { WebappClient } from "./client";

import type { Service } from "@cocalc/util/db-schema/purchases";
import { redux } from "@cocalc/frontend/app-framework";
import { once } from "@cocalc/util/async-utils";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import * as purchasesApi from "@cocalc/frontend/purchases/api";
import type { Changes as EditLicenseChanges } from "@cocalc/util/purchases/cost-to-edit-license";

export class PurchasesClient {
  async getQuotas(): Promise<{
    minBalance: number;
    services: { [service: string]: number };
  }> {
    return await purchasesApi.getQuotas();
  }

  async getBalance(): Promise<number> {
    return await purchasesApi.getBalance();
  }

  async getSpendRate(): Promise<number> {
    return await purchasesApi.getSpendRate();
  }

  async getClosingDates(): Promise<{ last: Date; next: Date }> {
    return await purchasesApi.getClosingDates();
  }

  async setQuota(
    service: Service,
    value: number
  ): Promise<{ global: number; services: { [service: string]: number } }> {
    return await purchasesApi.setQuota(service, value);
  }

  async isPurchaseAllowed(
    service: Service,
    cost?: number
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

  async getPaymentMethods() {
    return await purchasesApi.getPaymentMethods();
  }

  async getCustomer() {
    return await purchasesApi.getCustomer();
  }

  async getChargesByService() {
    return await purchasesApi.getChargesByService();
  }

  async createCredit(opts): Promise<any> {
    return await purchasesApi.createCredit(opts);
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

  async syncPaidInvoices() {
    await purchasesApi.syncPaidInvoices();
  }

  // this is only used in the nextjs store app right now...
  async getShoppingCartCheckoutParams() {
    return await purchasesApi.getShoppingCartCheckoutParams();
  }

  async getVoucherCartCheckoutParams(count: number) {
    return await purchasesApi.getVoucherCartCheckoutParams(count);
  }

  async adminGetMinBalance(account_id: string): Promise<number> {
    return await purchasesApi.adminGetMinBalance(account_id);
  }

  async adminSetMinBalance(account_id: string, minBalance: number) {
    await purchasesApi.adminSetMinBalance(account_id, minBalance);
  }

  async getLicense(license_id: string) {
    return await purchasesApi.getLicense(license_id);
  }

  async renewSubscription(
    subscription_id: number
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
