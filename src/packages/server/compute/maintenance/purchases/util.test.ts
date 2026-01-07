import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "@cocalc/server/compute/create-server";
import { getServer } from "@cocalc/server/compute/get-servers";
import { setPurchaseId } from "./util";
import { waitToAvoidTestFailure } from "@cocalc/server/test-utils";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("creates compute server then sets the purchase id and confirms it", () => {
  const account_id = uuid();
  let project_id;

  let server_id;
  it("creates compute server", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "One",
      account_id,
      noFirstProject: true,
    });
    // Only User One:
    project_id = await createProject({
      account_id,
      title: "My First Project",
      start: false,
    });
    await waitToAvoidTestFailure();
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
    await waitToAvoidTestFailure();
  });

  it("set purchase id and verify it", async () => {
    await setPurchaseId({ server_id, cost_per_hour: 0.1, purchase_id: 17 });
    const server = await getServer({ account_id, id: server_id });
    expect(server.purchase_id).toBe(17);
  });
});
