import { dstream } from "@cocalc/backend/conat/sync";
import { before, after, client, wait } from "@cocalc/backend/conat/test/setup";

const log = process.env.VERBOSE ? console.log : (..._args) => {};

beforeAll(before);

jest.setTimeout(10000);

describe("a stress test", () => {
  const name = `test-${Math.random()}`;
  const pushCount = 2000;
  let s;
  it(`creates an ephemeral stream and pushes ${pushCount} messages`, async () => {
    const start = Date.now();
    s = await dstream({
      client,
      name,
      noAutosave: true,
      ephemeral: true,
    });
    for (let i = 0; i < pushCount; i++) {
      s.push({ i });
    }
    expect(s.length).toBe(pushCount);
    // NOTE: warning -- this is **MUCH SLOWER**, e.g., 10x slower,
    // running under jest, hence why count is small.
    await s.save();
    expect(s.length).toBe(pushCount);
    log(
      "write",
      Math.round((1000 * pushCount) / (Date.now() - start)),
      "messages per second",
    );
  });

  it("deletes all of the messages we just wrote", async () => {
    const start = Date.now();
    await s.delete({ seqs: s.seqs() });
    await s.save();
    await wait({ until: () => s.length == 0 });
    expect(s.length).toBe(0);
    log(
      "delete",
      Math.round((1000 * pushCount) / (Date.now() - start)),
      "messages per second",
    );
  });
});

afterAll(after);
