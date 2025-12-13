import {
  before,
  after,
  uuid,
  connect,
  server,
  delay,
  once,
  wait,
} from "./setup";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "path";

beforeAll(before);
afterAll(after);

describe("deleting a file that is open as a syncdoc", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client1, client2, s1, s2, fs;
  const deletedThreshold = 50; // make test faster
  const watchRecreateWait = 100;
  const readLockTimeout = 250;

  it(`creates two clients editing '${path}'`, async () => {
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

  const waitDeleted = (doc): Promise<void> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("deleted not received")),
        5000,
      );
      doc.once("deleted", () => {
        clearTimeout(t);
        resolve();
      });
    });

  it(`delete 'a.txt' from disk and both clients emit 'deleted' event in about ${deletedThreshold}ms`, async () => {
    expect(s1.isDeleted).toBe(false);
    expect(s2.isDeleted).toBe(false);
    expect(s1.to_str()).toBe("my existing file");
    expect(s2.to_str()).toBe("my existing file");

    const start = Date.now();
    const d1 = waitDeleted(s1);
    const d2 = waitDeleted(s2);
    await fs.unlink(path);
    await d1;
    await d2;
    expect(Date.now() - start).toBeLessThan(deletedThreshold + 1000);

    expect(s1.isDeleted).toBe(true);
    expect(s2.isDeleted).toBe(true);
  });

  it("clients still work (clients can ignore 'deleted' if they want)", async () => {
    expect(s1.isClosed()).toBe(false);
    expect(s2.isClosed()).toBe(false);
    s1.from_str("back");
    await s1.save_to_disk();

    expect(await fs.readFile("a.txt", "utf8")).toEqual("back");
    await wait({
      until: () => s2.to_str() == "back",
    });
    expect(s2.to_str()).toEqual("back");

    // no longer deleted:
    await wait({
      until: () => !s1.isDeleted && !s2.isDeleted,
    });
  });

  it(`deleting 'a.txt' again -- still triggers deleted events`, async () => {
    const start = Date.now();
    const d1 = waitDeleted(s1);
    const d2 = waitDeleted(s2);
    await fs.unlink("a.txt");
    await d1;
    await d2;
    expect(Date.now() - start).toBeLessThan(deletedThreshold + 1000);
    expect(s1.isDeleted).toBe(true);
    expect(s2.isDeleted).toBe(true);
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
    await unlink(join(server.path, project_id, "a.txt"));
    await delay(10);
    await fs.writeFile(path, "I'm back!");
    await delay(deletedThreshold);
    expect(c1).toBe(0);
  });

  it("delete directly and wait and that is detected", async () => {
    await unlink(join(server.path, project_id, "a.txt"));
    await once(s1, "deleted");
  });
});
