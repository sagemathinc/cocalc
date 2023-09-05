import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import getServers from "./get-servers";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import createServer from "./create-server";

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
    });
    // Only User One:
    project_id = await createProject({
      account_id,
      title: "My First Project",
    });
  });

  it("creates a compute server for project one and gets it", async () => {
    const id = await createServer({
      created_by: account_id,
      project_id,
    });

    expect(
      await getServers({
        account_id,
      }),
    ).toEqual([{ id, created_by: account_id, project_id }]);

    // get by id:
    expect(
      await getServers({
        account_id,
        id,
      }),
    ).toEqual([{ id, created_by: account_id, project_id }]);
  });

  it("creates compute server with every parameters set to something", async () => {
    const s = {
      name: "myserver",
      color: "red",
      idle_timeout: 60 * 15,
      autorestart: true,
      cloud: "gcp",
      gpu: "a10",
      gpu_count: 1,
      cpu: "any",
      core_count: 4,
      memory: 16,
      spot: true,
    } as const;
    const id = await createServer({
      created_by: account_id,
      project_id,
      ...s,
    });
    expect(
      await getServers({
        account_id,
        id,
      }),
    ).toEqual([{ id, created_by: account_id, project_id, ...s }]);
  });

  it("a user can't create a compute server on a project they aren't a collaborator on", async () => {
    await expect(
      createServer({
        created_by: account_id,
        project_id: uuid(),
      }),
    ).rejects.toThrow("must be a collaborator");
  });
});
