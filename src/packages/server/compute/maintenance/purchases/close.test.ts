/*
Test functions for closing purchases in various ways.
*/

import createAccount from "@cocalc/server/accounts/create-account";
import { setTestNetworkUsage } from "@cocalc/server/compute/control";
import createServer from "@cocalc/server/compute/create-server";
import { getServer } from "@cocalc/server/compute/get-servers";
import createProject from "@cocalc/server/projects/create";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import { ComputeServerNetworkUsage } from "@cocalc/util/db-schema/purchases";
import { uuid } from "@cocalc/util/misc";
import {
  closeAndContinuePurchase,
  closeAndPossiblyContinueNetworkPurchase,
  closePurchase,
} from "./close";
import { getPurchase } from "./util";
import { before, after } from "@cocalc/server/test";

beforeAll(before, 15000);
afterAll(after);

describe("creates account, project, test compute server, and purchase, then close the purchase, and confirm it worked properly", () => {
  const account_id = uuid();
  let project_id: string;
  let server_id: number;
  let purchase_id: number;

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
    if (purchaseAfter.cost == null) {
      throw Error("fail");
    }
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
    if (purchaseAfter.period_end == null) {
      throw Error("fail");
    }
    expect(
      Math.abs(Date.now() - (purchaseAfter.period_end.valueOf() ?? 0)),
    ).toBeLessThan(30 * 1000);
    const newPurchase = await getPurchase(newPurchaseId);
    if (newPurchase.period_start == null) {
      throw Error("fail");
    }
    expect(
      Math.abs(Date.now() - (newPurchase.period_start.valueOf() ?? 0)),
    ).toBeLessThan(30 * 1000);
  });

  it("creates a network purchase, then closes it and verifies cost and amount are set properly", async () => {
    const period_start = new Date(Date.now() - 1000 * 60 * 60 * 24); // 2 hours ago
    purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server-network-usage",
      period_start,
      description: {
        type: "compute-server-network-usage",
        compute_server_id: server_id,
        amount: 0,
        last_updated: period_start.valueOf(),
      },
    });
    const server = await getServer({ account_id, id: server_id });
    server.state = "off";
    const purchase = await getPurchase(purchase_id);
    setTestNetworkUsage({ id: server_id, amount: 389, cost: 3.89 });
    const new_id = await closeAndPossiblyContinueNetworkPurchase({
      purchase,
      server,
    });
    const purchaseAfter = await getPurchase(purchase_id);
    expect(purchaseAfter.period_end == null).toBe(false);
    // we now explicitly do NOT set these costs -- they will be set later upon querying bigquery.
    expect(purchaseAfter.cost).toBe(null);
    expect(purchaseAfter.cost_so_far).toBe(null);
    expect(new_id).toBe(undefined); // should NOT have created new one since server is off.
  });

  it("creates a network purchase, then closes it, but this time with the server running, so a new purchase is created", async () => {
    const period_start = new Date(Date.now() - 1000 * 60 * 60 * 24); // 2 hours ago
    purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server-network-usage",
      cost_so_far: 0,
      period_start,
      description: {
        type: "compute-server-network-usage",
        compute_server_id: server_id,
        amount: 0,
        last_updated: period_start.valueOf(),
      },
    });
    const server = await getServer({ account_id, id: server_id });
    server.state = "running";
    const purchase = await getPurchase(purchase_id);
    setTestNetworkUsage({ id: server_id, amount: 389, cost: 3.89 });
    const new_id = await closeAndPossiblyContinueNetworkPurchase({
      purchase,
      server,
    });
    const purchaseAfter = await getPurchase(purchase_id);
    expect(purchaseAfter.period_end == null).toBe(false);
    // should be null -- this is NOT set by closing, but days later!
    expect(purchaseAfter.cost).toBe(null);

    const newPurchase = await getPurchase(new_id);
    if (newPurchase.description.type != "compute-server-network-usage") {
      throw Error("bug");
    }
    expect(
      (newPurchase.description as ComputeServerNetworkUsage).compute_server_id,
    ).toBe(server_id);
    expect(newPurchase.description.amount).toBe(0);
  });
});
