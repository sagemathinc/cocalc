import { before, after, uuid, connect, server, once } from "./setup";

beforeAll(before);
afterAll(after);

describe("deleting a file that is open as a syncdoc", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client1, client2, s1, s2, fs;
  const deletedThreshold = 50; // make test faster

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
    });

    await once(s1, "ready");

    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
      deletedThreshold,
    });
    await once(s2, "ready");
  });

  it("delete 'a.txt' from disk and both clients emit 'deleted' event in about ${deletedThreshold}ms", async () => {
    const start = Date.now();
    const d1 = once(s1, "deleted");
    const d2 = once(s2, "deleted");
    await fs.unlink("a.txt");
    await d1;
    await d2;
    expect(Date.now() - start).toBeLessThan(deletedThreshold + 1000);
  });
});
