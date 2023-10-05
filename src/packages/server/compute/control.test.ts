import { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "./create-server";
import * as control from "./control";
import { delay } from "awaiting";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  setTimeout(process.exit, 1);
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

  it("start the server", async () => {
    await control.start({ account_id, id });
    await delay(10);
    expect(await control.state({ account_id, id })).toBe("starting");
  });

  it("waits for the server to start running", async () => {
    await control.waitForStableState({
      account_id,
      id,
    });
    expect(await control.state({ account_id, id })).toBe("running");
  });

  it("stop the server", async () => {
    control.stop({ account_id, id });
    await delay(10);
    expect(await control.state({ account_id, id })).toBe("stopping");
  });

  it("wait for it to stop", async () => {
    await control.waitForStableState({
      account_id,
      id,
    });
    expect(await control.state({ account_id, id })).toBe("off");
  });

});
