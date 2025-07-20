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

  // this is not implemented yet
  it.skip("changes the file on disk and the watcher automatically updates with no explicit call needed", async () => {
    await fs.writeFile(path, "changed again!");
    await wait({
      until: () => {
        return s.to_str() == "changed again!";
      },
    });
  });
});
