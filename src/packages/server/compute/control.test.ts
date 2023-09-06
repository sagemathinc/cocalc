import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "./create-server";
import * as control from "./control";
import { getServer } from "./get-servers";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("creates account, project and a test compute server, then control it", () => {
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
      name: "myserver",
      idle_timeout: 15,
      cloud: "test",
    } as const;
    id = await createServer({
      account_id,
      project_id,
      ...s,
    });
  });

  it("start the server", async () => {
    await control.start({ account_id, id });
    expect((await getServer({ account_id, id })).state).toBe("starting");
  });

  //   it("waits for the server to start running", async () => {
  //     await control.waitForStableState({ account_id, id });
  //     expect((await getServer({ account_id, id })).state).toBe("running");
  //   });
});
