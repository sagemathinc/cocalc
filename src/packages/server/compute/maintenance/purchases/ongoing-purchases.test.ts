/*
Test that having ongoing purchases in various scenarios results in
the servers being marked as needing attention when ongoingPurchases
is run.

Most of the work here is in setting up a compute server and a purchase
in the database, in order to run the test.
*/

import ongoingPurchases from "./ongoing-purchases";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "@cocalc/server/compute/create-server";
import { getServer } from "@cocalc/server/compute/get-servers";
import {
  PERIODIC_UPDATE_INTERVAL_MS,
  MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS,
  MAX_PURCHASE_LENGTH_MS,
} from "./manage-purchases";
import createPurchase from "@cocalc/server/purchases/create-purchase";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});


describe("creates account, project, test compute server, and purchase", () => {
  const account_id = uuid();
  let project_id;

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

  let id;
  it("creates compute server on the 'test' cloud", async () => {
    const s = {
      title: "myserver",
      idle_timeout: 15,
      cloud: "test",
    } as const;
    id = await createServer({
      account_id,
      project_id,
      ...s,
    });
  });

  it("runs ongoingPurchases and confirms that our new server did NOT get flagged", async () => {
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
  });

  it("set state of our server to 'off' (off costs but doesn't trigger network), then check that server does get flagged because it was never flagged before and state is not active. This tests that things work properly when last_purchase_update is null.", async () => {
    const pool = getPool();
    // just being 1000% sure that last_purchase_update is null by setting it explicitly
    await pool.query(
      "UPDATE compute_servers SET state='off',last_purchase_update=NULL WHERE id=$1",
      [id],
    );
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(true);
  });

  it("clear flag and mark last_purchase_update as right now and verify that server does NOT get flagged", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW() WHERE id=$1",
      [id],
    );
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
  });

  // this won't work if we set state to running, since then the network update happens, which is more frequent
  it("clear flag and mark last_purchase_update as first more recent than PERIODIC_UPDATE_INTERVAL_MS then less recent, verify that server DOES NOT, then DOES get flagged for update", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '${
        (0.9 * PERIODIC_UPDATE_INTERVAL_MS) / 1000
      } seconds' WHERE id=$1`,
      [id],
    );
    await ongoingPurchases();
    let server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
    await pool.query(
      `UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '${
        PERIODIC_UPDATE_INTERVAL_MS / 1000 + 30
      } seconds' WHERE id=$1`,
      [id],
    );
    await ongoingPurchases();
    server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(true);
  });

  it("clear flag, set state to running, and test network periodi update works as it should", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE compute_servers SET state='running', update_purchase=FALSE, last_purchase_update=NOW()-interval '${
        (0.9 * MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS) / 1000
      } seconds' WHERE id=$1`,
      [id],
    );
    await ongoingPurchases();
    let server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
    await pool.query(
      `UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '${
        MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS / 1000 + 30
      } seconds' WHERE id=$1`,
      [id],
    );
    await ongoingPurchases();
    server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(true);
  });

  let purchase_id;
  it("clear flag, create a corresponding active purchase that started recently, then check that server does NOT get flagged", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '1 minute' WHERE id=$1",
      [id],
    );
    let server = await getServer({ account_id, id });
    purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server",
      cost_per_hour: 0.1,
      period_start: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
      description: {
        type: "compute-server",
        compute_server_id: id,
        state: "running",
        configuration: server.configuration,
      },
    });
    await ongoingPurchases();
    server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
  });

  it("change that purchase to have started a longer time ago, then check that server DOES get flagged", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE purchases SET period_start=NOW()-INTERVAL '${
        MAX_PURCHASE_LENGTH_MS / 1000 + 30
      } seconds' WHERE id=$1`,
      [purchase_id],
    );
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(true);
  });

  it("clear flag, make purchase closed, then check that server does NOT get flagged", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '1 minute' WHERE id=$1",
      [id],
    );
    await pool.query(
      `UPDATE purchases SET period_end=NOW(), cost=10 WHERE id=$1`,
      [purchase_id],
    );
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
  });

  it("make recent network purchase, then check that server does NOT get flagged", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET update_purchase=FALSE, last_purchase_update=NOW()-interval '5 minutes' WHERE id=$1",
      [id],
    );
    const purchase_id = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "compute-server-network-usage",
      cost_so_far: 0,
      period_start: new Date(Date.now() - 1000 * 60 * 2), //  minutes ago
      description: {
        type: "compute-server-network-usage",
        compute_server_id: id,
        amount: 0,
        last_updated: Date.now() - 2 * 60 * 1000,
      },
    });
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(false);
    await pool.query("DELETE FROM purchases WHERE id=$1", [purchase_id]);
  });

  it("check that server does get flagged if last purchase update is older than the network timeout since server is running", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE compute_servers SET state='running', update_purchase=FALSE, last_purchase_update=NOW()-interval '${
        MAX_NETWORK_USAGE_UPDATE_INTERVAL_MS / 1000 + 30
      } seconds' WHERE id=$1`,
      [id],
    );
    await ongoingPurchases();
    const server = await getServer({ account_id, id });
    expect(!!server.update_purchase).toBe(true);
  });
});
