/*
Test managing purchases
*/

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "@cocalc/server/compute/create-server";
import { getServer } from "@cocalc/server/compute/get-servers";
import managePurchases, { outstandingPurchases } from "./manage-purchases";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  setTimeout(process.exit, 1);
});

describe("confirm managing of purchases works", () => {
  const account_id = uuid();
  let project_id;
  let server_id;

  it("does one call to managePurchases to so there's no servers marked as needing updates", async () => {
    await managePurchases();
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT count(*) AS count FROM compute_servers WHERE update_purchase=TRUE",
    );
    expect(rows[0].count).toBe("0");
    // if this test turns out to be flaky, just do a query to set all the update_purchase's
    // to false.  There's no telling what is in the database going into this.
    // Obviously this makes parallel testing of different files not possible, but
    // that is ok, usually.
  });

  it("creates account, project and compute server on test cloud", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "One",
      account_id,
    });
    project_id = await createProject({
      account_id,
      title: "My First Project",
    });
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

  it("set server state to 'starting' (and update_purchase true), then see that a purchase in state 'running' is created by managePurchases", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET state='starting',update_purchase=TRUE WHERE id=$1",
      [server_id],
    );
    await managePurchases();
    const server = await getServer({ account_id, id: server_id });
    const purchases = await outstandingPurchases(server);
    expect(purchases.length).toBe(1);
    expect(purchases[0].description.type).toBe("compute-server");
    if (purchases[0].description.type != "compute-server") {
      throw Error("bug");
    }
    expect(purchases[0].description.state).toBe("running");
    expect(purchases[0].service).toBe("compute-server");
  });

  it("set server state to 'running' (and update_purchase true), then see that a purchase in state 'running' is created by managePurchases", async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE compute_servers SET state='running',update_purchase=TRUE WHERE id=$1",
      [server_id],
    );
    await managePurchases();
    const server = await getServer({ account_id, id: server_id });
    const purchases = await outstandingPurchases(server);
    expect(purchases.length).toBe(2);
    const network = purchases.filter(
      (x) => x.service == "compute-server-network-usage",
    );
    expect(network.length).toBe(1);
    expect(network[0].description.type).toBe("compute-server-network-usage");
    if (network[0].description.type != "compute-server-network-usage") {
      throw Error("bug");
    }
    expect(network[0].service).toBe("compute-server-network-usage");
  });
});
