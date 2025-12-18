import { delay } from "awaiting";

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "./create-server";
import * as control from "./control";
import { waitToAvoidTestFailure } from "@cocalc/server/test-utils";

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
      noFirstProject: true,
    });
    // Only User One:
    project_id = await createProject({
      account_id,
      title: "My First Project",
      start: false,
    });
    await waitToAvoidTestFailure();
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
    await waitToAvoidTestFailure();
  });

  it("start the server", async () => {
    await control.start({ account_id, id });
    // we have to do something like this... because control.start is pretty
    // complicated, involves api keys, the database, etc., and there is no
    // telling how long it takes to change the state. Moroever, the state
    // might be starting or running.  This will timeout with an error if the
    // state were to fail to change.
    while ((await control.state({ account_id, id })) == "off") {
      await delay(10);
    }
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
    while ((await control.state({ account_id, id })) == "running") {
      await delay(10);
    }
  });

  it("wait for it to stop", async () => {
    await control.waitForStableState({
      account_id,
      id,
    });
    expect(await control.state({ account_id, id })).toBe("off");
  });
});
