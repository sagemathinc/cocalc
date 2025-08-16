

import { before, after, uuid, connect, server, once, delay } from "./setup";

beforeAll(before);
afterAll(after);

describe("loading/saving syncstring to disk and setting values", () => {
  let s;
  const project_id = uuid();
  let client;

  it("creates the client", () => {
    client = connect();
  });

  it("create syncstring -- we still have to give a filename to define the 'location'", async () => {
    s = client.sync.string({
      project_id,
      path: "new.txt",
      service: server.service,
      noFs: true,
    });
    await once(s, "ready");
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
    s.from_str("foo");
    await s.save_to_disk();
  });

  let fs;
  it("get fs access and observe new.txt is NOT created on disk", async () => {
    fs = client.fs({ project_id, service: server.service });
    expect(await fs.exists("new.txt")).toBe(false);
  });

  it("writing to new.txt has no impact on the non-fs syncstring", async () => {
    await fs.writeFile("new.txt", "hello");
    await delay(200);
    expect(s.to_str()).toEqual("foo");
  });
});
