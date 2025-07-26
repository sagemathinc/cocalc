import { link, readFile, symlink } from "node:fs/promises";
import { join } from "path";
import { fsClient } from "@cocalc/conat/files/fs";
import { randomId } from "@cocalc/conat/names";
import { before, after } from "@cocalc/backend/conat/test/setup";
import { uuid } from "@cocalc/util/misc";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";

beforeAll(before);

describe("use all the standard api functions of fs", () => {
  let server;
  it("creates the simple fileserver service", async () => {
    server = await createPathFileserver();
  });

  const project_id = uuid();
  let fs;
  it("create a client", () => {
    fs = fsClient({ subject: `${server.service}.project-${project_id}` });
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

  it("the full error message structure is preserved exactly as in the nodejs library", async () => {
    const path = randomId();
    try {
      await fs.readFile(path);
    } catch (err) {
      expect(err.message).toEqual(
        `ENOENT: no such file or directory, open '${path}'`,
      );
      expect(err.message).toContain(path);
      expect(err.code).toEqual("ENOENT");
      expect(err.errno).toEqual(-2);
      expect(err.path).toEqual(path);
      expect(err.syscall).toEqual("open");
    }
  });

  let fire;
  it("readdir works", async () => {
    await fs.mkdir("dirtest");
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(`dirtest/${i}`, `${i}`);
    }
    fire = "🔥.txt";
    await fs.writeFile(join("dirtest", fire), "this is ️‍🔥!");
    const v = await fs.readdir("dirtest");
    expect(v).toEqual(["0", "1", "2", "3", "4", fire]);
  });

  it("readdir with the withFileTypes option", async () => {
    const path = "readdir-1";
    await fs.mkdir(path);
    expect(await fs.readdir(path, { withFileTypes: true })).toEqual([]);
    await fs.writeFile(join(path, "a.txt"), "");

    {
      const v = await fs.readdir(path, { withFileTypes: true });
      expect(v.map(({ name }) => name)).toEqual(["a.txt"]);
      expect(v.map((x) => x.isFile())).toEqual([true]);
    }
    {
      await fs.mkdir(join(path, "co"));
      const v = await fs.readdir(path, { withFileTypes: true });
      expect(v.map(({ name }) => name)).toEqual(["a.txt", "co"]);
      expect(v.map((x) => x.isFile())).toEqual([true, false]);
      expect(v.map((x) => x.isDirectory())).toEqual([false, true]);
    }

    {
      await fs.symlink(join(path, "a.txt"), join(path, "link"));
      const v = await fs.readdir(path, { withFileTypes: true });
      expect(v.map(({ name }) => name)).toEqual(["a.txt", "co", "link"]);
      expect(v[2].isSymbolicLink()).toEqual(true);
    }
  });

  it("readdir with the recursive option", async () => {
    const path = "readdir-2";
    await fs.mkdir(path);
    expect(await fs.readdir(path, { recursive: true })).toEqual([]);
    await fs.mkdir(join(path, "subdir"));
    await fs.writeFile(join(path, "subdir", "b.txt"), "x");
    const v = await fs.readdir(path, { recursive: true });
    expect(v).toEqual(["subdir", "subdir/b.txt"]);

    // and withFileTypes
    const w = await fs.readdir(path, { recursive: true, withFileTypes: true });
    expect(w.map(({ name }) => name)).toEqual(["subdir", "b.txt"]);
    expect(w[0]).toEqual(
      expect.objectContaining({
        name: "subdir",
        parentPath: path,
        path,
      }),
    );
    expect(w[0].isDirectory()).toBe(true);
    expect(w[1]).toEqual(
      expect.objectContaining({
        name: "b.txt",
        parentPath: join(path, "subdir"),
        path: join(path, "subdir"),
      }),
    );
    expect(w[1].isFile()).toBe(true);
    expect(await fs.readFile(join(w[1].path, w[1].name), "utf8")).toEqual("x");
  });

  it("use the find command instead of readdir", async () => {
    const { stdout } = await fs.find("dirtest", "%f\n");
    const v = stdout.toString().trim().split("\n");
    // output of find is NOT in alphabetical order:
    expect(new Set(v)).toEqual(new Set(["0", "1", "2", "3", "4", fire]));
  });

  it("realpath works", async () => {
    await fs.writeFile("file0", "file0");
    await fs.symlink("file0", "file1");
    expect(await fs.readFile("file1", "utf8")).toBe("file0");
    const r = await fs.realpath("file1");
    expect(r).toBe("file0");

    await fs.writeFile("file2", "file2");
    await fs.link("file2", "file3");
    expect(await fs.readFile("file3", "utf8")).toBe("file2");
    const r3 = await fs.realpath("file3");
    expect(r3).toBe("file3");
  });

  it("rename a file", async () => {
    await fs.writeFile("bella", "poo");
    await fs.rename("bella", "bells");
    expect(await fs.readFile("bells", "utf8")).toBe("poo");
    await fs.mkdir("x");
    await fs.rename("bells", "x/belltown");
  });

  it("rm a file", async () => {
    await fs.writeFile("bella-to-rm", "poo");
    await fs.rm("bella-to-rm");
    expect(await fs.exists("bella-to-rm")).toBe(false);
  });

  it("rm a directory", async () => {
    await fs.mkdir("rm-dir");
    expect(async () => {
      await fs.rm("rm-dir");
    }).rejects.toThrow("Path is a directory");
    await fs.rm("rm-dir", { recursive: true });
    expect(await fs.exists("rm-dir")).toBe(false);
  });

  it("rm a nonempty directory", async () => {
    await fs.mkdir("rm-dir2");
    await fs.writeFile("rm-dir2/a", "a");
    await fs.rm("rm-dir2", { recursive: true });
    expect(await fs.exists("rm-dir2")).toBe(false);
  });

  it("rmdir empty directory", async () => {
    await fs.mkdir("rm-dir3");
    await fs.rmdir("rm-dir3");
    expect(await fs.exists("rm-dir3")).toBe(false);
  });

  it("stat not existing path", async () => {
    expect(async () => {
      await fs.stat(randomId());
    }).rejects.toThrow("no such file or directory");
  });

  it("stat a file", async () => {
    await fs.writeFile("abc.txt", "hi");
    const stat = await fs.stat("abc.txt");
    expect(stat.size).toBe(2);
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isDirectory()).toBe(false);
    expect(stat.isBlockDevice()).toBe(false);
    expect(stat.isCharacterDevice()).toBe(false);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFIFO()).toBe(false);
    expect(stat.isSocket()).toBe(false);
  });

  it("stat a directory", async () => {
    await fs.mkdir("my-stat-dir");
    const stat = await fs.stat("my-stat-dir");
    expect(stat.isFile()).toBe(false);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isBlockDevice()).toBe(false);
    expect(stat.isCharacterDevice()).toBe(false);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFIFO()).toBe(false);
    expect(stat.isSocket()).toBe(false);
  });

  it("stat a symlink", async () => {
    await fs.writeFile("sl2", "the source");
    await fs.symlink("sl2", "target-sl2");
    const stat = await fs.stat("target-sl2");
    // this is how stat works!
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    // so use lstat
    const lstat = await fs.lstat("target-sl2");
    expect(lstat.isFile()).toBe(false);
    expect(lstat.isSymbolicLink()).toBe(true);
  });

  it("truncate a file", async () => {
    await fs.writeFile("t", "");
    await fs.truncate("t", 10);
    const s = await fs.stat("t");
    expect(s.size).toBe(10);
  });

  it("delete a file with unlink", async () => {
    await fs.writeFile("to-unlink", "");
    await fs.unlink("to-unlink");
    expect(await fs.exists("to-unlink")).toBe(false);
  });

  it("sets times of a file", async () => {
    await fs.writeFile("my-times", "");
    const atime = Date.now() - 100_000;
    const mtime = Date.now() - 10_000_000;
    // NOTE: fs.utimes in nodejs takes *seconds*, not ms, hence
    // dividing by 1000 here:
    await fs.utimes("my-times", atime / 1000, mtime / 1000);
    const s = await fs.stat("my-times");
    expect(s.atimeMs).toBeCloseTo(atime);
    expect(s.mtimeMs).toBeCloseTo(mtime);
    expect(s.atime.valueOf()).toBeCloseTo(atime);
    expect(s.mtime.valueOf()).toBeCloseTo(mtime);
  });

  it("creating a symlink works (as does using lstat)", async () => {
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

  it("watch a file", async () => {
    await fs.writeFile("a.txt", "hi");
    const w = await fs.watch("a.txt");
    await fs.appendFile("a.txt", " there");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "a.txt" },
    });
  });

  it("watch a directory", async () => {
    const FOLDER = randomId();
    await fs.mkdir(FOLDER);
    const w = await fs.watch(FOLDER);

    await fs.writeFile(join(FOLDER, "x"), "hi");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "x" },
    });
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "x" },
    });

    await fs.appendFile(join(FOLDER, "x"), "xxx");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "x" },
    });

    await fs.writeFile(join(FOLDER, "z"), "there");
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "z" },
    });
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "change", filename: "z" },
    });

    // this is correct -- from the node docs "On most platforms, 'rename' is emitted whenever a filename appears or disappears in the directory."
    await fs.unlink(join(FOLDER, "z"));
    expect(await w.next()).toEqual({
      done: false,
      value: { eventType: "rename", filename: "z" },
    });
  });
});

describe("SECURITY CHECKS: dangerous symlinks can't be followed", () => {
  let server;
  let tempDir;
  it("creates the simple fileserver service", async () => {
    server = await createPathFileserver();
    tempDir = server.path;
  });

  const project_id = uuid();
  const project_id2 = uuid();
  let fs, fs2;
  it("create two clients", () => {
    fs = fsClient({ subject: `${server.service}.project-${project_id}` });
    fs2 = fsClient({ subject: `${server.service}.project-${project_id2}` });
  });

  it("create a secret in one", async () => {
    await fs.writeFile("password", "s3cr3t");
    await fs2.writeFile("a", "init");
  });

  // This is setup bypassing security and is part of our threat model, due to users
  // having full access internally to their sandbox fs.
  it("directly create a dangerous file that is a symlink outside of the sandbox -- this should work", async () => {
    await symlink(
      join(tempDir, project_id, "password"),
      join(tempDir, project_id2, "danger"),
    );
    const s = await readFile(join(tempDir, project_id2, "danger"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("fails to read the symlink content via the api", async () => {
    await expect(async () => {
      await fs2.readFile("danger", "utf8");
    }).rejects.toThrow("outside of sandbox");
  });

  it("directly create a dangerous relative symlink ", async () => {
    await symlink(
      join("..", project_id, "password"),
      join(tempDir, project_id2, "danger2"),
    );
    const s = await readFile(join(tempDir, project_id2, "danger2"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("fails to read the relative symlink content via the api", async () => {
    await expect(async () => {
      await fs2.readFile("danger2", "utf8");
    }).rejects.toThrow("outside of sandbox");
  });

  // This is not a vulnerability, because there's no way for the user
  // to create a hard link like this from within an nfs mount (say)
  // of their own folder.
  it("directly create a hard link", async () => {
    await link(
      join(tempDir, project_id, "password"),
      join(tempDir, project_id2, "danger3"),
    );
    const s = await readFile(join(tempDir, project_id2, "danger3"), "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("a hardlink *can* get outside the sandbox", async () => {
    const s = await fs2.readFile("danger3", "utf8");
    expect(s).toBe("s3cr3t");
  });

  it("closes the server", () => {
    server.close();
  });
});

afterAll(async () => {
  await after();
  await cleanupFileservers();
});
