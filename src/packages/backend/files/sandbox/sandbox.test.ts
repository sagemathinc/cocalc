import { SandboxedFilesystem } from "@cocalc/backend/files/sandbox";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
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
    expect(fs.unsafeMode).toBe(false);
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
    await fs.writeFile("x", "hi");
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
    await fs.writeFile("x", "hi");
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

  it("maxQueue with overflow throw", async () => {
    await fs.writeFile("x", "hi");
    const w = await fs.watch("x", { maxQueue: 2, overflow: "throw" });
    await fs.appendFile("x", "0");
    await fs.appendFile("x", "0");
    await fs.appendFile("x", "0");
    expect(async () => {
      await w.next();
    }).rejects.toThrow("maxQueue overflow");
    w.end();
  });

  it("AbortController works", async () => {
    const ac = new AbortController();
    const { signal } = ac;
    await fs.writeFile("x", "hi");
    const w = await fs.watch("x", { signal });
    await fs.appendFile("x", "0");
    const e = await w.next();
    expect(e.done).toBe(false);

    // now abort
    ac.abort();
    const { done } = await w.next();
    expect(done).toBe(true);
  });

  it("watches a directory", async () => {
    await fs.mkdir("folder");
    const w = await fs.watch("folder");

    await fs.writeFile("folder/x", "hi");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "x" },
    });
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "x" },
    });

    await fs.appendFile("folder/x", "xxx");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "x" },
    });

    await fs.writeFile("folder/z", "there");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "z" },
    });
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "z" },
    });

    // this is correct -- from the node docs "On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory."
    await fs.unlink("folder/z");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "z" },
    });
  });
});

describe("unsafe mode sandbox", () => {
  let fs;
  it("creates and reads file", async () => {
    await mkdir(join(tempDir, "test-unsafe"));
    fs = new SandboxedFilesystem(join(tempDir, "test-unsafe"), {
      unsafeMode: true,
    });
    expect(fs.unsafeMode).toBe(true);
    await fs.writeFile("a", "hi");
    const r = await fs.readFile("a", "utf8");
    expect(r).toEqual("hi");
  });

  it("directly create a dangerous file that is a symlink outside of the sandbox -- this should work", async () => {
    await writeFile(join(tempDir, "password"), "s3cr3t");
    await symlink(
      join(tempDir, "password"),
      join(tempDir, "test-unsafe", "danger"),
    );
    const s = await readFile(join(tempDir, "test-unsafe", "danger"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("can **UNSAFELY** read the symlink content via the api", async () => {
    expect(await fs.readFile("danger", "utf8")).toBe("s3cr3t");
  });
});

describe("safe mode sandbox", () => {
  let fs;
  it("creates and reads file", async () => {
    await mkdir(join(tempDir, "test-safe"));
    fs = new SandboxedFilesystem(join(tempDir, "test-safe"), {
      unsafeMode: false,
    });
    expect(fs.unsafeMode).toBe(false);
    expect(fs.readonly).toBe(false);
    await fs.writeFile("a", "hi");
    const r = await fs.readFile("a", "utf8");
    expect(r).toEqual("hi");
  });

  it("directly create a dangerous file that is a symlink outside of the sandbox -- this should work", async () => {
    await writeFile(join(tempDir, "password"), "s3cr3t");
    await symlink(
      join(tempDir, "password"),
      join(tempDir, "test-safe", "danger"),
    );
    const s = await readFile(join(tempDir, "test-safe", "danger"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("cannot read the symlink content via the api", async () => {
    await expect(async () => {
      await fs.readFile("danger", "utf8");
    }).rejects.toThrow("outside of sandbox");
  });
});

describe("read only sandbox", () => {
  let fs;
  it("creates and reads file", async () => {
    await mkdir(join(tempDir, "test-ro"));
    fs = new SandboxedFilesystem(join(tempDir, "test-ro"), {
      readonly: true,
    });
    expect(fs.readonly).toBe(true);
    await expect(async () => {
      await fs.writeFile("a", "hi");
    }).rejects.toThrow("permission denied -- read only filesystem");
    try {
      await fs.writeFile("a", "hi");
    } catch (err) {
      expect(err.code).toEqual("EACCES");
    }
  });
});

afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});
