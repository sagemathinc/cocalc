import { before, after, uuid, client, server, once } from "./setup";

beforeAll(before);
afterAll(after);

const log = process.env.BENCH ? console.log : (..._args) => {};

describe("loading/saving syncstring to disk and setting values", () => {
  let s;
  const project_id = uuid();
  let fs;
  it("time opening a syncstring for editing a file that already exists on disk", async () => {
    fs = client.fs({ project_id, service: server.service });
    await fs.writeFile("a.txt", "hello");

    const t0 = Date.now();
    await fs.readFile("a.txt", "utf8");
    log("lower bound: time to read file", Date.now() - t0, "ms");

    const start = Date.now();
    s = client.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
    });
    await once(s, "ready");
    const total = Date.now() - start;
    log("actual time to open sync document", total);

    expect(s.to_str()).toBe("hello");
  });
});
