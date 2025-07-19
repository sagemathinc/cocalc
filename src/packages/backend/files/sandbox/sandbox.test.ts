import { SandboxedFilesystem } from "@cocalc/backend/files/sandbox";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";

let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
});

describe("test using the filesystem sandbox to do a few standard things", () => {
  let fs;
  it("creates and reads file", async () => {
    await mkdir(join(tempDir, "test-1"));
    fs = new SandboxedFilesystem(join(tempDir, "test-1"));
    await fs.writeFile("a", "hi");
    const r = await fs.readFile("a", "utf8");
    expect(r).toEqual("hi");
  });

  it("truncate file", async () => {
    await fs.writeFile("b", "hello");
    await fs.truncate("b", 4);
    const r = await fs.readFile("b", "utf8");
    expect(r).toEqual("hell");
  });
});

describe("make various attempts to break out of the sandbox", () => {
  let fs;
  it("creates sandbox", async () => {
    await mkdir(join(tempDir, "test-2"));
    fs = new SandboxedFilesystem(join(tempDir, "test-2"));
    await fs.writeFile("x", "hi");
  });

  it("obvious first attempt to escape fails", async () => {
    const v = await fs.readdir("..");
    expect(v).toEqual(["x"]);
  });

  it("obvious first attempt to escape fails", async () => {
    const v = await fs.readdir("a/../..");
    expect(v).toEqual(["x"]);
  });

  it("another attempt", async () => {
    await fs.copyFile("/x", "/tmp");
    const v = await fs.readdir("a/../..");
    expect(v).toEqual(["tmp", "x"]);

    const r = await fs.readFile("tmp", "utf8");
    expect(r).toEqual("hi");
  });
});

describe("test watching a file and a folder in the sandbox", () => {
  let fs;
  it("creates sandbox", async () => {
    await mkdir(join(tempDir, "test-watch"));
    fs = new SandboxedFilesystem(join(tempDir, "test-watch"));
    await fs.writeFile("x", "hi");
  });

  it("watches the file x for changes", async () => {
    const w = await fs.watch("x");
    await fs.appendFile("x", " there");
    const x = await w.next();
    expect(x).toEqual({
      value: { eventType: "change", filename: "x" },
      done: false,
    });
    w.end();
  });

  it("the maxQueue parameter limits the number of queue events", async () => {
    const w = await fs.watch("x", { maxQueue: 2 });
    expect(w.queueSize()).toBe(0);
    // make many changes
    await fs.appendFile("x", "0");
    await fs.appendFile("x", "0");
    await fs.appendFile("x", "0");
    await fs.appendFile("x", "0");
    // there will only be 2 available:
    expect(w.queueSize()).toBe(2);
    const x0 = await w.next();
    expect(x0).toEqual({
      value: { eventType: "change", filename: "x" },
      done: false,
    });
    const x1 = await w.next();
    expect(x1).toEqual({
      value: { eventType: "change", filename: "x" },
      done: false,
    });
    // one more next would hang...
    expect(w.queueSize()).toBe(0);
    w.end();
  });
});

afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});
