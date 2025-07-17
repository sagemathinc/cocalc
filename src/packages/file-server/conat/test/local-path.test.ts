import { localPathFileserver } from "../local-path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { fsClient } from "@cocalc/conat/files/fs";
import { randomId } from "@cocalc/conat/names";

let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc-local-path"));
});

describe("use the simple fileserver", () => {
  const service = `fs-${randomId()}`;
  let server;
  it("creates the simple fileserver service", async () => {
    server = await localPathFileserver({ service, path: tempDir });
  });

  const project_id = "6b851643-360e-435e-b87e-f9a6ab64a8b1";
  let fs;
  it("create a client", () => {
    fs = fsClient({ subject: `${service}.project-${project_id}` });
  });

  it("appendFile works", async () => {
    await fs.writeFile("a", "");
    await fs.appendFile("a", "foo");
    expect(await fs.readFile("a", "utf8")).toEqual("foo");
  });

  it("chmod works", async () => {
    await fs.writeFile("b", "hi");
    await fs.chmod("b", 0o755);
    const s = await fs.stat("b");
    expect(s.mode.toString(8)).toBe("100755");
  });

  it("constants work", async () => {
    const constants = await fs.constants();
    expect(constants.O_RDONLY).toBe(0);
    expect(constants.O_WRONLY).toBe(1);
    expect(constants.O_RDWR).toBe(2);
  });

  it("copyFile works", async () => {
    await fs.writeFile("c", "hello");
    await fs.copyFile("c", "d.txt");
    expect(await fs.readFile("d.txt", "utf8")).toEqual("hello");
  });

  it("cp works on a directory", async () => {
    await fs.mkdir("folder");
    await fs.writeFile("folder/a.txt", "hello");
    await fs.cp("folder", "folder2", { recursive: true });
    expect(await fs.readFile("folder2/a.txt", "utf8")).toEqual("hello");
  });

  it("exists works", async () => {
    expect(await fs.exists("does-not-exist")).toBe(false);
    await fs.writeFile("does-exist", "");
    expect(await fs.exists("does-exist")).toBe(true);
  });

  it("creating a hard link works", async () => {
    await fs.writeFile("source", "the source");
    await fs.link("source", "target");
    expect(await fs.readFile("target", "utf8")).toEqual("the source");
    // hard link, not symlink
    expect(await fs.realpath("target")).toBe("target");

    await fs.appendFile("source", " and more");
    expect(await fs.readFile("target", "utf8")).toEqual("the source and more");
  });

  it("mkdir works", async () => {
    await fs.mkdir("xyz");
    const s = await fs.stat("xyz");
    expect(s.isDirectory()).toBe(true);
  });

  it("creating a symlink works", async () => {
    await fs.writeFile("source1", "the source");
    await fs.symlink("source1", "target1");
    expect(await fs.readFile("target1", "utf8")).toEqual("the source");
    // symlink, not hard
    expect(await fs.realpath("target1")).toBe("source1");
    await fs.appendFile("source1", " and more");
    expect(await fs.readFile("target1", "utf8")).toEqual("the source and more");
    const stats = await fs.stat("target1");
    expect(stats.isSymbolicLink()).toBe(false);

    const lstats = await fs.lstat("target1");
    expect(lstats.isSymbolicLink()).toBe(true);

    const stats0 = await fs.stat("source1");
    expect(stats0.isSymbolicLink()).toBe(false);
  });

  it("closes the service", () => {
    server.close();
  });
});

afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});
