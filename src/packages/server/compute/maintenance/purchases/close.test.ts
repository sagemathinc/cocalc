/*
Test functions for closing purchases in various ways.
*/

import {
  closePurchase,
  closeAndContinuePurchase,
  closeAndContinueNetworkPurchase,
} from "./close";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "@cocalc/server/compute/create-server";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { getPurchase } from "./util";
import { getServer } from "@cocalc/server/compute/get-servers";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  setTimeout(process.exit, 1);
});

describe("creates account, project, test compute server, and purchase, then close the purchase, and confirm it worked properly", () => {
  const account_id = uuid();
  let project_id;
  let server_id;
  let purchase_id;

  it("creates account and project", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "One",
      account_id,
    });
    // Only User One:
    project_id = await createProject({
      account_id,
      title: "My First Project",
    });
  });

  it("creates compute server on the 'test' cloud", async () => {
    const s = {
      title: "myserver",
      idle_timeout: 15,
      cloud: "test",
    } as const;
    server_id = await createServer({
      account_id,
      project_id,
      ...s,
    });
  });

  it("creates a purchase", async () => {
    purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server",
      cost_per_hour: 0.1,
      period_start: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      description: {
        type: "compute-server",
        compute_server_id: server_id,
        state: "running",
        configuration: {} as any, // not important
      },
    });
  });

  it("closes the purchases and checks that it worked properly", async () => {
    const purchase = await getPurchase(purchase_id);
    await closePurchase({ purchase });
    const purchaseAfter = await getPurchase(purchase_id);
    expect(
      Math.abs(Date.now() - (purchaseAfter.period_end?.valueOf() ?? 0)),
    ).toBeLessThan(30 * 1000);
    // 0.05 is about half the 0.1 above, since time is 30 minutes
    expect(Math.abs(purchaseAfter.cost - 0.05)).toBeLessThan(0.01);
  });

  it("calling close on already closed purchases doesn't break", async () => {
    const purchase = await getPurchase(purchase_id);
    await closePurchase({ purchase });
  });

  it("create a purchase starting just over a day ago, then close and continue it, and observe that purchase closes and a new one starts", async () => {
    const server = await getServer({ account_id, id: server_id });
    purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server",
      cost_per_hour: 0.1,
      period_start: new Date(Date.now() - 1000 * 60 * 60 * 24), // 24 hours ago
      description: {
        type: "compute-server",
        compute_server_id: server_id,
        state: "running",
        configuration: server.configuration,
      },
    });
    const purchase = await getPurchase(purchase_id);
    const newPurchaseId = await closeAndContinuePurchase({ purchase, server });
    const purchaseAfter = await getPurchase(purchase_id);
    expect(
      Math.abs(Date.now() - purchaseAfter.period_end?.valueOf() ?? 0),
    ).toBeLessThan(30 * 1000);
    const newPurchase = await getPurchase(newPurchaseId);
    expect(
      Math.abs(Date.now() - newPurchase.period_start?.valueOf() ?? 0),
    ).toBeLessThan(30 * 1000);
  });
});
