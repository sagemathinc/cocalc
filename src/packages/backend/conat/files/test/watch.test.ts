import {
  before,
  after,
  client,
  wait,
  delay,
} from "@cocalc/backend/conat/test/setup";
import { watchServer, watchClient } from "@cocalc/conat/files/watch";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { randomId } from "@cocalc/conat/names";

let tmp;
beforeAll(async () => {
  await before();
  tmp = await mkdtemp(join(tmpdir(), `cocalc-${randomId()}0`));
});
afterAll(async () => {
  await after();
  try {
    await rm(tmp, { force: true, recursive: true });
  } catch {}
});

describe("basic core of the async path watch functionality", () => {
  let fs;
  it("creates sandboxed filesystem", () => {
    fs = new SandboxedFilesystem(tmp);
  });

  let server;
  it("create watch server", () => {
    server = watchServer({ client, subject: "foo", watch: fs.watch });
  });

  it("create a file", async () => {
    await fs.writeFile("a.txt", "hi");
  });

  let w;
  it("create a watcher client for 'a.txt'", async () => {
    w = await watchClient({ client, subject: "foo", path: "a.txt", fs });
  });

  it("observe watch works", async () => {
    await fs.appendFile("a.txt", "foo");
    expect(await w.next()).toEqual({
      done: false,
      value: { event: "change", filename: "" },
    });

    await fs.appendFile("a.txt", "bar");
    expect(await w.next()).toEqual({
      done: false,
      value: { event: "change", filename: "" },
    });
  });

  it("close the watcher client frees up a server socket", async () => {
    expect(Object.keys(server.sockets).length).toEqual(1);
    w.close();
    await wait({ until: () => Object.keys(server.sockets).length == 0 });
    expect(Object.keys(server.sockets).length).toEqual(0);
  });

  it("trying to watch file that does not exist is fine; it notices the file when it does exist", async () => {
    const w = await watchClient({ client, subject: "foo", path: "b.txt", fs });
    await delay(100);
    await fs.writeFile("b.txt", "foo");
    expect(await w.next()).toEqual({
      done: false,
      value: { event: "add", filename: "" },
    });
  });
});
