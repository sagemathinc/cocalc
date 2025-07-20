/*
Illustrate and test behavior when there is conflict.
*/

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

describe("synchronized editing with branching and merging", () => {
  const project_id = uuid();
  let s1, s2, client1, client2;

  it("creates two clients", async () => {
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

  it("both clients set the first version independently and inconsistently", async () => {
    s1.from_str("x");
    s2.from_str("y");
    s1.commit();
    s2.commit();
    await s1.save();
    await s2.save();
  });

  it("wait until both clients see two heads", async () => {
    let heads1, heads2;
    await wait({
      until: () => {
        heads1 = s1.patch_list.getHeads();
        heads2 = s2.patch_list.getHeads();
        return heads1.length == 2 && heads2.length == 2;
      },
    });
    expect(heads1.length).toBe(2);
    expect(heads2.length).toBe(2);
    expect(heads1).toEqual(heads2);
  });

  it("get the current value, which is a merge", () => {
    const v1 = s1.to_str();
    const v2 = s2.to_str();
    expect(v1).toEqual("xy");
    expect(v2).toEqual("xy");
  });

  // this is broken already:
  it.skip("commit current value and see that there is a new single head that both share, thus resolving the merge in this way", async () => {
    s1.commit();
    await s1.save();
    s1.show_history();
    let heads1, heads2;
    await wait({
      until: () => {
        heads1 = s1.patch_list.getHeads();
        heads2 = s2.patch_list.getHeads();
        console.log({ heads1, heads2 });
        return heads1.length == 1 && heads2.length == 1;
      },
    });
    expect(heads1.length).toBe(1);
    expect(heads2.length).toBe(1);
    expect(heads1).toEqual(heads2);
  });

  // set values inconsistently again and explicitly resolve the merge conflict
  // in a way that is different than the default.
});
