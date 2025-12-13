import {
  before,
  after,
  connect,
  uuid,
  wait,
  once,
  server,
  delay,
} from "./setup";

beforeAll(before);
afterAll(after);

describe("structured docs update when filesystem changes externally", () => {
  const project_id = uuid();
  const path = "external.syncdb";
  let client;
  let s;

  it("opens a syncdb and seeds one record", async () => {
    client = connect();
    s = client.sync.db({
      project_id,
      path,
      service: server.service,
      primary_keys: ["id"],
      string_cols: ["text"],
      firstReadLockTimeout: 1,
    });
    await once(s, "ready");
    s.set({ id: 1, text: "initial" });
    s.commit();
    await s.save();
    await s.save_to_disk();
  });

  it("writes to disk externally and watcher produces structured patch", async () => {
    await delay(5200);
    const newFile = `${s.to_str()}\n${JSON.stringify({ id: 2, text: "external" })}`;
    await s.fs.writeFile(path, newFile, false);
    await wait({
      until: () => s.get_one({ id: 2 }) != null,
      timeout: 10000,
    });
    const rec = s.get_one({ id: 2 });
    expect(rec?.toJS()).toEqual({ id: 2, text: "external" });
  });
});
jest.setTimeout(20000);
