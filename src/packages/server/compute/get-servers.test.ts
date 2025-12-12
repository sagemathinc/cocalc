import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import getServers, { getServer } from "./get-servers";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import addUserToProject from "@cocalc/server/projects/add-user-to-project";
import createServer from "./create-server";
import { delay } from "awaiting";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("calls get compute servers with various inputs with a new account with no data (everything should return [])", () => {
  it("throws 'account_id is not a valid uuid' if account_id not specified", async () => {
    // @ts-ignore: it's not valid of course
    await expect(getServers({ account_id: undefined })).rejects.toThrow(
      "account_id is not a valid uuid",
    );
  });

  it("throws error if account_id not a valid uuid", async () => {
    await expect(
      getServers({ account_id: "not-valid-uuid" }),
    ).rejects.toThrow();
  });
  const account_id = uuid();

  it("gets all compute servers", async () => {
    expect(await getServers({ account_id })).toEqual([]);
  });

  it("gets all compute servers for a given project, which throws error since project doesn't really exist", async () => {
    await expect(
      getServers({ account_id, project_id: uuid() }),
    ).rejects.toThrow("must be collaborator");
  });

  it("gets all compute servers I created", async () => {
    expect(await getServers({ account_id })).toEqual([]);
  });

  it("gets all compute servers I started", async () => {
    expect(await getServers({ account_id })).toEqual([]);
  });
});

describe("creates accounts, projects, compute servers, and tests querying", () => {
  const account_id1 = uuid(),
    account_id2 = uuid();
  let project_id1, project_id2;

  it("creates accounts and projects", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "One",
      account_id: account_id1,
      noFirstProject: true,
    });
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "Two",
      account_id: account_id2,
      noFirstProject: true,
    });
    // Only User One:
    project_id1 = await createProject({
      account_id: account_id1,
      title: "My First Project",
      start: false,
    });
    // sometimes above isn't noticed below, which is weird, so we put in slight delay.
    // TODO: it's surely because of using a connection pool instead of a single connection.
    await delay(300);
    // Both users
    project_id2 = await createProject({
      account_id: account_id2,
      title: "My Second Project",
      start: false,
    });
    // sometimes above isn't noticed below, which is weird, so we put in slight delay.
    // TODO: it's surely because of using a connection pool instead of a single connection.
    await delay(300);
    await addUserToProject({
      account_id: account_id1,
      project_id: project_id2,
    });
  });

  it("queries for compute servers by User Two on Project One and gets error", async () => {
    await expect(
      getServers({ account_id: account_id2, project_id: project_id1 }),
    ).rejects.toThrow("must be collaborator");
  });

  it("queries for compute servers by User One on Project One and it works", async () => {
    expect(
      await getServers({
        account_id: account_id1,
        project_id: project_id1,
      }),
    ).toEqual([]);
  });

  let id1;
  it("creates a compute server for project one and gets it", async () => {
    id1 = await createServer({
      account_id: account_id1,
      project_id: project_id1,
    });

    expect(
      await getServers({
        account_id: account_id1,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id1,
        account_id: account_id1,
        project_id: project_id1,
        state: "deprovisioned",
      }),
    ]);

    expect(
      await getServers({
        account_id: account_id1,
        project_id: project_id1,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id1,
        account_id: account_id1,
        project_id: project_id1,
        state: "deprovisioned",
      }),
    ]);

    expect(
      await getServers({
        account_id: account_id1,
        id: id1,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id1,
        account_id: account_id1,
        project_id: project_id1,
        state: "deprovisioned",
      }),
    ]);

    expect(
      await getServers({
        account_id: account_id2,
        project_id: project_id2,
      }),
    ).toEqual([]);

    expect(
      await getServers({
        account_id: account_id2,
        id: id1,
      }),
    ).toEqual([]);

    // user 2 can't get compute server with id id1, since not a collab on project_id1.
    await expect(
      getServer({
        account_id: account_id2,
        id: id1,
      }),
    ).rejects.toThrow("permission denied");

    expect(
      await getServers({
        account_id: account_id2,
      }),
    ).toEqual([]);
  });

  let id2;
  it("account 2 creates a compute server for project 2 and does some gets", async () => {
    id2 = await createServer({
      account_id: account_id2,
      project_id: project_id2,
    });

    expect(
      await getServers({
        account_id: account_id1,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id1,
        account_id: account_id1,
        project_id: project_id1,
        state: "deprovisioned",
      }),
    ]);

    // account 1 can get the servers on project 2 if they account 1 doesn't own it.
    expect(
      await getServers({
        account_id: account_id1,
        project_id: project_id2,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id2,
        account_id: account_id2,
        project_id: project_id2,
        state: "deprovisioned",
      }),
    ]);

    expect(
      await getServers({
        account_id: account_id2,
      }),
    ).toEqual([
      expect.objectContaining({
        id: id2,
        account_id: account_id2,
        project_id: project_id2,
        state: "deprovisioned",
      }),
    ]);
  });
});
