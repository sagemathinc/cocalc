import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import { getProject } from "@cocalc/server/projects/control";
import { before, after, client, connect } from "@cocalc/server/test";
import { addCollaborator } from "@cocalc/server/projects/collaborators";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

beforeAll(before);
afterAll(after);

describe("basic collab editing of a file *on disk* in a project -- verifying interaction between filesystem and editor", () => {
  const account_id1 = uuid(),
    account_id2 = uuid();
  let project_id;
  let project;
  let fs;

  it("create accounts and a project", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "One",
      account_id: account_id1,
    });

    await createAccount({
      email: "",
      password: "xyz",
      firstName: "User",
      lastName: "Two",
      account_id: account_id2,
    });

    project_id = await createProject({
      account_id: account_id1,
      title: "Collab Project",
      start: false,
    });
    project = getProject(project_id);

    fs = client.fs({ project_id });

    await addCollaborator({
      account_id: account_id1,
      opts: { account_id: account_id2, project_id },
    });
  });

  it("write a file that we will then open and edit (we have not started the project yet)", async () => {
    await fs.writeFile("a.txt", "hello");
    await fs.writeFile("b.txt", "hello");
    expect((await project.state()).state).toBe("opened");
  });

  let syncstring, syncstring2;
  it("open 'a.txt' for sync editing", async () => {
    const opts = {
      project_id,
      path: "a.txt",
      // we use a much shorter "ignoreOnSaveInterval" so testing is fast.
      ignoreOnSaveInterval: 100,
      watchDebounce: 1,
      deletedThreshold: 100,
      watchRecreateWait: 100,
      deletedCheckInterval: 50,
    };
    syncstring = client.sync.string(opts);
    // a second completely separate client:
    syncstring2 = connect().sync.string(opts);
    await Promise.all([syncstring.init(), syncstring2.init()]);
    expect(syncstring).not.toBe(syncstring2);

    expect(syncstring.to_str()).toEqual("hello");
    // the first version of the document should NOT be blank
    expect(syncstring.versions().length).toEqual(1);

    expect(syncstring2.to_str()).toEqual("hello");
    expect(syncstring2.versions().length).toEqual(1);
  });

  it("the clients loaded the file at the same time but this does NOT result in two copies (via a merge conflict)", async () => {
    const change = once(syncstring, "change");
    const change2 = once(syncstring2, "change");
    await Promise.all([syncstring.save(), syncstring2.save()]);
    await Promise.all([change, change2]);
    expect(syncstring.to_str()).toEqual("hello");
    expect(syncstring2.to_str()).toEqual("hello");
  });

  it("change the file and save to disk, then read from filesystem", async () => {
    syncstring.from_str("hello world");
    await syncstring.save_to_disk();
    expect((await fs.readFile("a.txt")).toString()).toEqual("hello world");
  });

  it("change the file on disk and observe s updates", async () => {
    const change = once(syncstring, "change");
    // wait so changes to the file on disk won't be ignored:
    await delay(syncstring.opts.ignoreOnSaveInterval + 50);
    await fs.writeFile("a.txt", "Hello World!");
    await change;
    console.log(syncstring.to_str());
    console.log(syncstring.show_history());
    expect(syncstring.to_str()).toEqual("Hello World!");
  });

  it("overwrite a.txt with the older b.txt and see that this update also triggers a change even though b.txt is older -- the point is that the time is *different*", async () => {
    await delay(syncstring.opts.ignoreOnSaveInterval + 50);
    const change = once(syncstring, "change");
    await fs.cp("b.txt", "a.txt", { preserveTimestamps: true });
    await change;
    expect(syncstring.to_str()).toEqual("hello");
    const a_stat = await fs.stat("a.txt");
    const b_stat = await fs.stat("b.txt");
    expect(a_stat.atime).toEqual(b_stat.atime);
    expect(a_stat.mtime).toEqual(b_stat.mtime);
  });

  it("delete 'a.txt' from disk and observe a 'deleted' event is emitted", async () => {
    await delay(250); // TODO: not good!
    const deleted = once(syncstring, "deleted");
    const deleted2 = once(syncstring2, "deleted");
    await fs.unlink("a.txt");
    await deleted;
    await deleted2;
    // good we got the event -- we can ignore it; but doc is now blank
    expect(syncstring.to_str()).toEqual("");
    expect(syncstring.isDeleted).toEqual(true);
    expect(syncstring2.to_str()).toEqual("");
    expect(syncstring2.isDeleted).toEqual(true);
  });

  // this fails!
  it("put a really old file at a.txt and it comes back from being deleted", async () => {
    const change = once(syncstring, "change");
    await fs.writeFile("old.txt", "i am old");
    await fs.utimes(
      "old.txt",
      (Date.now() - 100_000) / 1000,
      (Date.now() - 100_000) / 1000,
    );
    await fs.cp("old.txt", "a.txt", { preserveTimestamps: true });
    await change;
    expect(syncstring.to_str()).toEqual("i am old");
    // [ ] TODO: it's very disconcerting that isDeleted stays true for
    // one of these!
    //     await wait({
    //       until: () => {
    //         console.log([syncstring.isDeleted, syncstring2.isDeleted]);
    //         return !syncstring.isDeleted && !syncstring2.isDeleted;
    //       },
    //     });
    //     expect(syncstring.isDeleted).toEqual(false);
    //     expect(syncstring2.isDeleted).toEqual(false);
  });
});
