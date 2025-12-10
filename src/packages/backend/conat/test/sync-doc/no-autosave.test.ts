import {
  before,
  after,
  uuid,
  connect,
  server,
  once,
  delay,
  waitUntilSynced,
} from "./setup";

beforeAll(before);
afterAll(after);

describe("confirm noAutosave works", () => {
  const project_id = uuid();
  const path = "a.txt";
  let client1, client2, s1, s2;

  it("creates two clients with noAutosave enabled", async () => {
    client1 = connect();
    client2 = connect();
    await client1
      .fs({ project_id, service: server.service })
      .writeFile(path, "");
    s1 = client1.sync.string({
      project_id,
      path,
      service: server.service,
      noAutosave: true,
    });

    await once(s1, "ready");

    s2 = client2.sync.string({
      project_id,
      path,
      service: server.service,
      noAutosave: true,
    });
    await once(s2, "ready");
    expect(s1.noAutosave).toEqual(true);
    expect(s2.noAutosave).toEqual(true);
  });

  const howLong = 750;
  it(`write a change to s1 and commit it, but observe s2 does not see it even after ${howLong}ms (which should be plenty of time)`, async () => {
    s1.from_str("new-ver");
    s1.commit();

    expect(s2.to_str()).toEqual("");
    await delay(howLong);
    expect(s2.to_str()).toEqual("");
  });

  it("explicitly save and see s2 does get the change", async () => {
    await s1.save();
    await waitUntilSynced([s1, s2]);
    expect(s2.to_str()).toEqual("new-ver");
  });

  it("make a change resulting in two heads", async () => {
    s2.from_str("new-ver-1");
    s2.commit();
    // no background saving happening:
    await delay(100);
    s1.from_str("new-ver-2");
    s1.commit();
    await Promise.all([s1.save(), s2.save()]);
  });

  it("there are two heads and value is merged", async () => {
    await waitUntilSynced([s1, s2]);
    expect(s1.to_str()).toEqual("new-ver-1-2");
    expect(s2.to_str()).toEqual("new-ver-1-2");
    expect(s1.getHeads().length).toBe(2);
    expect(s2.getHeads().length).toBe(2);
  });

  it("string state info matches", async () => {
    const a1 = s1.syncstring_table_get_one().toJS();
    const a2 = s2.syncstring_table_get_one().toJS();
    expect(a1).toEqual(a2);
    expect(new Set(a1.users)).toEqual(
      new Set([s1.client.client_id(), s2.client.client_id()]),
    );
  });
});
