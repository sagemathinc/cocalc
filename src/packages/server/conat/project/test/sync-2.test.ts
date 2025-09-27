import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import { getProject } from "@cocalc/server/projects/control";
import { before, after, client, connect } from "@cocalc/server/test";
import { addCollaborator } from "@cocalc/server/projects/collaborators";
import { delay } from "awaiting";

beforeAll(before);
afterAll(after);

const count = 5;
describe(`open a file for the first time with ${count} clients simultaneously and it works without conflicts -- this illustrates locking`, () => {
  const account_ids: string[] = [];
  for (let i = 0; i < count; i++) {
    account_ids.push(uuid());
  }
  let project_id;
  let project;
  let fs;

  it("create accounts and a project", async () => {
    for (let i = 0; i < count; i++) {
      await createAccount({
        email: "",
        password: "xyz",
        firstName: "User",
        lastName: `${i}`,
        account_id: account_ids[i],
      });
    }

    project_id = await createProject({
      account_id: account_ids[0],
      title: "Collab Project",
      start: false,
    });
    project = getProject(project_id);

    fs = client.fs({ project_id });
    for (let i = 1; i < count; i++) {
      await addCollaborator({
        account_id: account_ids[0],
        opts: { account_id: account_ids[i], project_id },
      });
    }
  });

  it("write a file that all clients will open and edit at the exact same time", async () => {
    await fs.writeFile("a.txt", "hello");
    expect((await project.state()).state).toBe("opened");
  });

  let syncstrings: any[] = [];
  it("open 'a.txt' for sync editing in all clients", async () => {
    const opts = {
      project_id,
      path: "a.txt",
      // we use a much shorter "ignoreOnSaveInterval" so testing is fast.
      ignoreOnSaveInterval: 100,
      watchDebounce: 1,
      deletedThreshold: 100,
      watchRecreateWait: 100,
      deletedCheckInterval: 50,
      readLockTimeout: 250,
    };
    for (let i = 0; i < count; i++) {
      const syncstring = connect().sync.string(opts);
      syncstrings.push(syncstring);
    }
    await Promise.all(syncstrings.map((s) => s.init()));
    expect(syncstrings[0]).not.toBe(syncstrings[1]);
  });

  it("the clients loaded the file at the same time but this does NOT result in multiple copies (via a merge conflict)", async () => {
    await Promise.all(syncstrings.map((s) => s.save()));
    await delay(300);
    for (let i = 0; i < count; i++) {
      expect(syncstrings[i].to_str()).toEqual("hello");
    }
  });
});
