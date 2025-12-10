import {
  before,
  after,
  uuid,
  wait,
  connect,
  server,
  once,
  delay,
} from "./setup";

beforeAll(before);
afterAll(after);

describe("create syncstring without setting fs, so saving to disk and loading from disk are a no-op", () => {
  let s;
  const project_id = uuid();
  let client;

  it("creates the client", () => {
    client = connect();
  });

  it("a syncstring associated to a file that does not exist on disk is initialized to the empty string", async () => {
    s = client.sync.string({
      project_id,
      path: "new.txt",
      service: server.service,
    });
    await once(s, "ready");
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
    s.close();
  });

  let fs;
  it("a syncstring for editing a file that already exists on disk is initialized to that file", async () => {
    fs = client.fs({ project_id, service: server.service });
    await fs.writeFile("a.txt", "hello");
    s = client.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
      firstReadLockTimeout: 1,
    });
    await once(s, "ready");
    expect(s.fs).not.toEqual(undefined);
  });

  it("initially it is 'hello'", () => {
    expect(s.to_str()).toBe("hello");
    expect(s.versions().length).toBe(1);
  });

  it("set the value", () => {
    s.from_str("test");
    expect(s.to_str()).toBe("test");
    expect(s.versions().length).toBe(1);
  });

  it("save value to disk", async () => {
    await s.save_to_disk();
    await delay(100); // after the read lock is gone
    const disk = await fs.readFile("a.txt", "utf8");
    expect(disk).toEqual("test");
  });

  it("commit the value", () => {
    s.commit();
    expect(s.versions().length).toBe(2);
  });

  it("change the value and commit a second time", () => {
    s.from_str("bar");
    s.commit();
    expect(s.versions().length).toBe(3);
  });

  it("get first version", () => {
    expect(s.version(s.versions()[0]).to_str()).toBe("hello");
    expect(s.version(s.versions()[1]).to_str()).toBe("test");
  });
});

describe("synchronized editing with two copies of a syncstring", () => {
  const project_id = uuid();
  let s1, s2, client1, client2;

  it("creates the fs client and two copies of a syncstring", async () => {
    client1 = connect();
    client2 = connect();
    s1 = client1.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
    });
    await once(s1, "ready");

    s2 = client2.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
    });
    await once(s2, "ready");
    expect(s1.to_str()).toBe("");
    expect(s2.to_str()).toBe("");
    expect(s1 === s2).toBe(false);
  });

  it("change one, commit and save, and see change reflected in the other", async () => {
    s1.from_str("hello world");
    s1.commit();
    await s1.save();
    await wait({
      until: () => {
        return s2.to_str() == "hello world";
      },
    });
  });

  it("change second and see change reflected in first", async () => {
    s2.from_str("hello world!");
    s2.commit();
    await s2.save();
    await wait({ until: () => s1.to_str() == "hello world!" });
  });

  it("view the history from each", async () => {
    expect(s1.versions().length).toEqual(2);
    expect(s2.versions().length).toEqual(2);

    const v1: string[] = [],
      v2: string[] = [];
    s1.show_history({ log: (x) => v1.push(x) });
    s2.show_history({ log: (x) => v2.push(x) });
    expect(v1).toEqual(v2);
  });
});

describe("opening a new syncstring for a file that does NOT exist on disk does not emit a 'deleted' event", () => {
  let s;
  const project_id = uuid();
  let deleted = 0;
  it("a syncstring associated to a file that does not exist on disk is initialized to the empty string", async () => {
    const client = connect();
    s = client.sync.string({
      project_id,
      path: "this-file-is-not-on-disk.txt",
      service: server.service,
      // very aggressive:
      deletedThreshold: 50,
      deletedCheckInterval: 50,
      watchRecreateWait: 50,
    });
    s.on("deleted", () => {
      deleted++;
    });
    await once(s, "ready");
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
  });

  it("wait a bit and deleted is NOT emited", async () => {
    await delay(500);
    expect(deleted).toEqual(0);
  });

  it("change, save to disk, then delete file and get the deleted event", async () => {
    s.from_str("foo");
    s.commit();
    await s.save_to_disk();
    await delay(500);
    await s.fs.unlink(s.path);
    await delay(500);
    expect(deleted).toBe(1);
  });
});
