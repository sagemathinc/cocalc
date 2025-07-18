import { localPathFileserver } from "../local-path";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { fsClient } from "@cocalc/conat/files/fs";
import { randomId } from "@cocalc/conat/names";
import { before, after, client } from "@cocalc/backend/conat/test/setup";
import { uuid } from "@cocalc/util/misc";

let tempDir;
let tempDir2;
beforeAll(async () => {
  await before();
  tempDir = await mkdtemp(join(tmpdir(), "cocalc-local-path"));
  tempDir2 = await mkdtemp(join(tmpdir(), "cocalc-local-path-2"));
});

describe("use all the standard api functions of fs", () => {
  const service = `fs-${randomId()}`;
  let server;
  it("creates the simple fileserver service", async () => {
    server = await localPathFileserver({ client, service, path: tempDir });
  });

  const project_id = uuid();
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
    expect(s.isFile()).toBe(false);
  });

  it("readFile works", async () => {
    await fs.writeFile("a", Buffer.from([1, 2, 3]));
    const s = await fs.readFile("a");
    expect(s).toEqual(Buffer.from([1, 2, 3]));

    await fs.writeFile("b.txt", "conat");
    const t = await fs.readFile("b.txt", "utf8");
    expect(t).toEqual("conat");
  });

  it("readdir works", async () => {
    await fs.mkdir("dirtest");
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(`dirtest/${i}`, `${i}`);
    }
    const fire = "🔥.txt";
    await fs.writeFile(join("dirtest", fire), "this is ️‍🔥!");
    const v = await fs.readdir("dirtest");
    expect(v).toEqual(["0", "1", "2", "3", "4", fire]);
  });

  it("creating a symlink works (and using lstat)", async () => {
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

describe("security: dangerous symlinks can't be followed", () => {
  const service = `fs-${randomId()}`;
  let server;
  it("creates the simple fileserver service", async () => {
    server = await localPathFileserver({ client, service, path: tempDir2 });
  });

  const project_id = uuid();
  const project_id2 = uuid();
  let fs, fs2;
  it("create two clients", () => {
    fs = fsClient({ subject: `${service}.project-${project_id}` });
    fs2 = fsClient({ subject: `${service}.project-${project_id2}` });
  });

  it("create a secret in one", async () => {
    await fs.writeFile("password", "s3cr3t");
    await fs2.writeFile("a", "init");
  });

  // This is setup bypassing security and is part of our threat model, due to users
  // having full access internally to their sandbox fs.
  it("directly create a file that is a symlink outside of the sandbox -- this should work", async () => {
    await symlink(
      join(tempDir2, project_id, "password"),
      join(tempDir2, project_id2, "link"),
    );
    const s = await readFile(join(tempDir2, project_id2, "link"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("fails to read the symlink content via the api", async () => {
    await expect(async () => {
      await fs2.readFile("link", "utf8");
    }).rejects.toThrow("outside of sandbox");
  });

  it("directly create a relative symlink ", async () => {
    await symlink(
      join("..", project_id, "password"),
      join(tempDir2, project_id2, "link2"),
    );
    const s = await readFile(join(tempDir2, project_id2, "link2"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("fails to read the relative symlink content via the api", async () => {
    await expect(async () => {
      await fs2.readFile("link2", "utf8");
    }).rejects.toThrow("outside of sandbox");
  });

  it("closes the server", () => {
    server.close();
  });
});

afterAll(async () => {
  await after();
  await rm(tempDir, { force: true, recursive: true });
  // await rm(tempDir2, { force: true, recursive: true });
});
