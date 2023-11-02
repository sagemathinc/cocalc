/*
Test that having ongoing purchases in various scenarios results in
the servers being marked as needing attention when ongoingPurchases
is run.

Most of the work here is in setting up a compute server and a purchase
in the database, in order to run the test.
*/

import ongoingPurchases from "./ongoing-purchases";
import { initEphemeralDatabase } from "@cocalc/database/pool";
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
});
