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

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  setTimeout(process.exit, 1);
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

  it("set state of our server to 'running', then check that server does get flagged because it was never flagged before and state is not active. This tests that things work properly when last_purchase_update is null.", async () => {
    const pool = getPool();
    // just being 1000% sure that last_purchase_update is null by setting it explicitly
    await pool.query(
      "UPDATE compute_servers SET state='running',last_purchase_update=NULL WHERE id=$1",
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

  it("clear flag and mark last_purchase_update as a while ago and verify that server DOES not get flagged (even though there are no purchases)", async () => {});

  it("clear flag, create a corresponding active purchase that started recently, then check that server does NOT get flagged", async () => {});

  it("change that purchase to have started a long time ago, then check that server DOES get flagged", async () => {});

  it("clear flag, make purchase closed, then check that server does get flagged", async () => {});
  it("make recent network purchase, then check that server does NOT get flagged", async () => {});
  it("make network purchase be older, then check that server does get flagged", async () => {});
});
