import { before, after, uuid, connect, server, once, wait } from "./setup";

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

  let client2, s2;
  it("file watching also works if there are multiple clients, with only one handling the change", async () => {
    client2 = connect();
    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
    });
    let c = 0,
      c2 = 0;
    s.on("after-change", () => c++);
    s2.on("after-change", () => c2++);

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
});

/*
watching of file with multiple clients

-- only one does the actual file load

-- when one writes file to disk, another doesn't try to load it

(various ways to do that: sticky fs server would mean only one is
writing backend can ignore the resulting change event)
*/
