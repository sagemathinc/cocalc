import {
  before,
  after,
  uuid,
  connect,
  server,
  once,
  wait,
  delay,
  waitUntilSynced,
} from "./setup";

beforeAll(before);
afterAll(after);

const readLockTimeout = 100;
const watchDebounce = 50;

describe("basic watching of file on disk happens automatically", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client, s, fs;

  it("creates client", async () => {
    client = connect();
    fs = client.fs({ project_id, service: server.service });
    await fs.writeFile(path, "init");
    s = client.sync.string({
      project_id,
      path,
      service: server.service,
      readLockTimeout,
      watchDebounce,
      firstReadLockTimeout: 1,
    });
    await once(s, "ready");
    expect(s.to_str()).toEqual("init");
  });

  it("changes the file on disk and call readFile to immediately update", async () => {
    await fs.writeFile(path, "modified");
    await s.readFile();
    expect(s.to_str()).toEqual("modified");
  });

  it("change file on disk and it automatically updates with no explicit call needed", async () => {
    await delay(50);
    await fs.writeFile(path, "changed again!");
    await wait({
      until: () => {
        // NOTE: this looks mangled because the fs change is *merged*
        // into the not-yet saved change from above.  That's
        // intentional.
        return s.to_str() == "modchanged again!ed";
      },
    });
  });

  it("changes the file on disk and call readFile to immediately update", async () => {
    await fs.writeFile(path, "modified");
    await s.readFile();
    await s.save_to_disk();
    expect(s.to_str()).toEqual("modified");

    await delay(500);
    await fs.writeFile(path, "changed again!");
    await wait({
      until: () => {
        // we saved back to disk above.
        return s.to_str() == "changed again!";
      },
    });
  });

  let client2, s2;
  it("file watching also works if there are multiple clients", async () => {
    client2 = connect();
    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
      readLockTimeout,
      watchDebounce,
      firstReadLockTimeout: 1,
    });
    await once(s2, "ready");
    await delay(100);

    await fs.writeFile(path, "version3");
    await wait({
      until: () => {
        return s2.to_str() == "version3" && s.to_str() == "version3";
      },
    });
  });
});

describe("has unsaved changes", () => {
  const project_id = uuid();
  let s1, s2, client1, client2;

  it("creates two clients and opens a new file (does not exist on disk yet)", async () => {
    client1 = connect();
    client2 = connect();
    s1 = client1.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
      firstReadLockTimeout: 1,
    });
    await once(s1, "ready");
    // definitely has unsaved changes, since it doesn't even exist
    expect(s1.has_unsaved_changes()).toBe(true);

    s2 = client2.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
      firstReadLockTimeout: 1,
    });
    await once(s2, "ready");
    expect(s1.to_str()).toBe("");
    expect(s2.to_str()).toBe("");
    expect(s1 === s2).toBe(false);
    expect(s2.has_unsaved_changes()).toBe(true);
  });

  it("save empty file to disk -- now no unsaved changes", async () => {
    await s1.save_to_disk();
    expect(s1.has_unsaved_changes()).toBe(false);
    // but s2 doesn't know anything
    expect(s2.has_unsaved_changes()).toBe(true);
  });

  it("make a change via s2 and save", async () => {
    s2.from_str("i am s2");
    await s2.save_to_disk();
    expect(s2.has_unsaved_changes()).toBe(false);
  });

  it("as soon as s1 learns that there was a change to the file on disk, it doesn't know", async () => {
    await waitUntilSynced([s1, s2]);
    expect(s1.has_unsaved_changes()).toBe(true);
    expect(s1.to_str()).toEqual("i am s2");
  });
});
