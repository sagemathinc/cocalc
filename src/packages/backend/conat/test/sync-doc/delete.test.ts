import { before, after, uuid, connect, server, once, delay } from "./setup";

beforeAll(before);
afterAll(after);

describe("deleting a file that is open as a syncdoc", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client1, client2, s1, s2, fs;
  const deletedThreshold = 50; // make test faster
  const watchRecreateWait = 100;
  const readLockTimeout = 250;

  it("creates two clients editing 'a.txt'", async () => {
    client1 = connect();
    client2 = connect();
    fs = client1.fs({ project_id, service: server.service });
    await fs.writeFile(path, "my existing file");
    s1 = client1.sync.string({
      project_id,
      path,
      fs,
      deletedThreshold,
      watchRecreateWait,
      readLockTimeout,
    });

    await once(s1, "ready");

    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
      deletedThreshold,
      watchRecreateWait,
      readLockTimeout,
    });
    await once(s2, "ready");
  });

  // [ ] TODO: this is broken because s2's deleted never fires, because...
  // only one client is a watcher at once.  We need way for everybody to
  // learn about deletion of file, not just one client.
  it(`delete 'a.txt' from disk and both clients emit 'deleted' event in about ${deletedThreshold}ms`, async () => {
    expect(s1.isDeleted).toBe(false);
    expect(s2.isDeleted).toBe(false);

    const start = Date.now();
    s1.on("deleted", () => {
      console.log("s1 deleted");
    });
    s2.on("deleted", () => {
      console.log("s2 deleted");
    });
    const d1 = once(s1, "deleted");
    const d2 = once(s2, "deleted");
    await fs.unlink(path);
    await d1;
    await d2;
    expect(Date.now() - start).toBeLessThan(deletedThreshold + 1000);
  });

  it("clients still work (clients can ignore 'deleted' if they want)", async () => {
    expect(s1.isClosed()).toBe(false);
    expect(s2.isClosed()).toBe(false);
    s1.from_str("back");
    const w1 = once(s1, "watching");
    const w2 = once(s2, "watching");
    await s1.save_to_disk();
    await w1;
    await w2;

    // note: we lock for a moment after write to avoid a race condition
    // with multiple clientss editing.
    try {
      await fs.readFile("a.txt", "utf8");
    } catch (err) {
      expect(`${err}`).toContain("locked");
    }
    await delay(readLockTimeout * 3);
    expect(await fs.readFile("a.txt", "utf8")).toEqual("back");
  });

  it(`deleting 'a.txt' again -- still triggers deleted events`, async () => {
    const start = Date.now();
    const d1 = once(s1, "deleted");
    const d2 = once(s2, "deleted");
    await fs.unlink("a.txt");
    await d1;
    await d2;
    expect(Date.now() - start).toBeLessThan(deletedThreshold + 1000);
  });
});

describe("deleting a file then recreate it quickly does NOT trigger a 'deleted' event", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client1, s1, fs;
  const deletedThreshold = 250;

  it("creates two clients editing 'a.txt'", async () => {
    client1 = connect();
    fs = client1.fs({ project_id, service: server.service });
    await fs.writeFile(path, "my existing file");
    s1 = client1.sync.string({
      project_id,
      path,
      fs,
      service: server.service,
      deletedThreshold,
    });

    await once(s1, "ready");
  });

  it(`delete 'a.txt' from disk and both clients emit 'deleted' event in about ${deletedThreshold}ms`, async () => {
    let c1 = 0;
    s1.once("deleted", () => {
      c1++;
    });
    await fs.unlink("a.txt");
    await delay(deletedThreshold - 100);
    await fs.writeFile(path, "I'm back!");
    await delay(deletedThreshold);
    expect(c1).toBe(0);
  });
});
