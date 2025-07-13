/*
Testing things about dstream that involve persistence.
*/

import {
  before,
  after,
  connect,
  delay,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

describe("create a dstream, write data, close it, then open it again and see data persisted", () => {
  let client;
  const name = "foo";
  it("create clients and a document", async () => {
    client = connect();
    const v = await client.sync.dstream({ name });
    v.publish("x");
    await v.save();
    v.close();
  });

  it("opening again and see that it persisted", async () => {
    const v = await client.sync.dstream({ name });
    expect(v.getAll()).toEqual(["x"]);
  });
});

// this is here because I had a bug in the syncRefCache that this exposed.
describe("just like above, create a dstream, write data, close it, then open it again and see data persisted -- **but do it all in the same function**", () => {
  let client;
  const name = "foo2";
  it("create clients and a document", async () => {
    client = connect();
    const v = await client.sync.dstream({ name });
    v.publish("x");
    await v.save();
    v.close();
    const w = await client.sync.dstream({ name });
    expect(w.getAll()).toEqual(["x"]);
    w.close();
  });
});

afterAll(async () => {
  await delay(100);
  after();
});
