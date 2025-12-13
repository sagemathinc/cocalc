import {
  before,
  after,
  uuid,
  delay,
  wait,
  connect,
  server,
  once,
} from "./setup";

beforeAll(before);
afterAll(after);

describe("loading/saving syncstring to disk and setting values", () => {
  let s;
  const project_id = uuid();
  let client;

  it("creates a client", () => {
    client = connect();
  });

  it("a syncdb associated to a file that does not exist on disk is initialized to empty", async () => {
    s = client.sync.db({
      project_id,
      path: "new.syncdb",
      service: server.service,
      primary_keys: ["name"],
      firstReadLockTimeout: 1,
    });
    await once(s, "ready");
    expect(s.to_str()).toBe("");
    // there's one version loading the empty string from disk.
    expect(s.versions().length).toBe(1);
  });

  it("store a record", async () => {
    s.set({ name: "cocalc", value: 10 });
    expect(s.to_str()).toBe('{"name":"cocalc","value":10}');
    const t = s.get_one({ name: "cocalc" }).toJS();
    expect(t).toEqual({ name: "cocalc", value: 10 });
    await s.commit();
    await s.save();
    // [ ] TODO: this save to disk definitely should NOT be needed
    await s.save_to_disk();
  });

  let client2, s2;
  it("connect another client", async () => {
    client2 = connect();
    // [ ] loading this resets the state if we do not save above.
    s2 = client2.sync.db({
      project_id,
      path: "new.syncdb",
      service: server.service,
      primary_keys: ["name"],
      firstReadLockTimeout: 1,
    });
    await once(s2, "ready");
    expect(s2).not.toBe(s);
    expect(s2.to_str()).toBe('{"name":"cocalc","value":10}');
    const t = s2.get_one({ name: "cocalc" }).toJS();
    expect(t).toEqual({ name: "cocalc", value: 10 });

    s2.set({ name: "conat", date: new Date() });
    s2.commit();
    await s2.save();
  });

  it("verifies the change on s2 is seen by s (and also that Date objects do NOT work)", async () => {
    await wait({ until: () => s.get_one({ name: "conat" }) != null });
    const t = s.get_one({ name: "conat" }).toJS();
    expect(t).toEqual({ name: "conat", date: t.date });
    // They don't work because we're storing syncdb's in jsonl format,
    // so json is used.  We should have a new format called
    // msgpackl and start using that.
    expect(t.date instanceof Date).toBe(false);
  });

  const count = 1000;
  it(`store ${count} records`, async () => {
    const before = s.get().size;
    for (let i = 0; i < count; i++) {
      s.set({ name: i });
    }
    s.commit();
    await s.save();
    expect(s.get().size).toBe(count + before);
  });

  it("confirm file saves to disk with many lines", async () => {
    await s.save_to_disk();
    await delay(50); // wait for lock to go away
    const v = (await s.fs.readFile("new.syncdb", "utf8")).split("\n");
    expect(v.length).toBe(s.get().size);
  });

  it("verifies lookups are not too slow (there is an index)", () => {
    for (let i = 0; i < count; i++) {
      expect(s.get_one({ name: i }).get("name")).toEqual(i);
    }
  });
});
