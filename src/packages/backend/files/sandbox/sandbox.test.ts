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

afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});
