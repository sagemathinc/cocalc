import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import getServers from "./get-servers";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "./create-server";
import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";
import { waitToAvoidTestFailure } from "@cocalc/server/test-utils";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("creates account, project and then compute servers in various ways", () => {
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

  it("creates a compute server for project one and gets it", async () => {
    const id = await createServer({
      account_id,
      project_id,
    });
    await waitToAvoidTestFailure();

    expect(
      await getServers({
        account_id,
      }),
    ).toEqual([
      expect.objectContaining({
        id,
        account_id,
        project_id,
        state: "deprovisioned",
      }),
    ]);

    // get by id:
    expect(
      await getServers({
        account_id,
        id,
      }),
    ).toEqual([
      expect.objectContaining({
        id,
        account_id,
        project_id,
        state: "deprovisioned",
      }),
    ]);
  });

  it("creates compute server with every parameters set to something", async () => {
    const s = {
      title: "myserver",
      color: "red",
      autorestart: true,
      cloud: "google-cloud",
    } as const;
    const id = await createServer({
      account_id,
      project_id,
      ...s,
    });
    await waitToAvoidTestFailure();
    expect(
      await getServers({
        account_id,
        id,
      }),
    ).toEqual([
      expect.objectContaining({
        id,
        account_id,
        project_id,
        ...s,
        state: "deprovisioned",
        configuration: CLOUDS_BY_NAME["google-cloud"].defaultConfiguration,
      }),
    ]);
  });

  it("a user can't create a compute server on a project they aren't a collaborator on", async () => {
    await expect(
      createServer({
        account_id,
        project_id: uuid(),
      }),
    ).rejects.toThrow("must be a collaborator");
  });
});
