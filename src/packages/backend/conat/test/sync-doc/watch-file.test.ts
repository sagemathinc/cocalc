import {
  before,
  after,
  uuid,
  connect,
  server,
  once,
  wait,
  delay,
} from "./setup";

beforeAll(before);
afterAll(after);

describe("basic watching of file on disk happens automatically", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client, s, fs;

  it("creates two clients with noAutosave enabled", async () => {
    client = connect();
    fs = client.fs({ project_id, service: server.service });
    await fs.writeFile(path, "init");
    s = client.sync.string({
      project_id,
      path,
      service: server.service,
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
    await fs.writeFile(path, "changed again!");
    await wait({
      until: () => {
        return s.to_str() == "changed again!";
      },
    });
  });

  it("change file on disk should not trigger a load from disk", async () => {
    const orig = s.fsLoadFromDiskDebounced;
    let c = 0;
    s.fsLoadFromDiskDebounced = () => {
      c += 1;
    };
    s.from_str("a different value");
    await s.save_to_disk();
    expect(c).toBe(0);
    await delay(100);
    expect(c).toBe(0);
    s.fsLoadFromDiskDebounced = orig;
    // disable the ignore that happens as part of save_to_disk,
    // or the tests below won't work
    await s.fsFileWatcher?.ignore(0);
  });

  let client2, s2;
  it("file watching also works if there are multiple clients, with only one handling the change", async () => {
    client2 = connect();
    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
    });
    await once(s2, "ready");
    let c = 0,
      c2 = 0;
    s.on("handle-file-change", () => c++);
    s2.on("handle-file-change", () => c2++);

    await fs.writeFile(path, "version3");
    await wait({
      until: () => {
        return s2.to_str() == "version3" && s.to_str() == "version3";
      },
    });
    expect(s.to_str()).toEqual("version3");
    expect(s2.to_str()).toEqual("version3");
    expect(c + c2).toBe(1);
  });

  it("file watching must still work if either client is closed", async () => {
    s.close();
    await fs.writeFile(path, "version4");
    await wait({
      until: () => {
        return s2.to_str() == "version4";
      },
    });
    expect(s2.to_str()).toEqual("version4");
  });

  let client3, s3;
  it("add a third client and close client2 and have file watching still work", async () => {
    client3 = connect();
    s3 = client3.sync.string({
      project_id,
      path,
      service: server.service,
    });
    await once(s3, "ready");
    s2.close();

    await fs.writeFile(path, "version5");

    await wait({
      until: () => {
        return s3.to_str() == "version5";
      },
    });
    expect(s3.to_str()).toEqual("version5");
  });
});

/*
watching of file with multiple clients

-- only one does the actual file load

-- when one writes file to disk, another doesn't try to load it

(various ways to do that: sticky fs server would mean only one is
writing backend can ignore the resulting change event)
*/
