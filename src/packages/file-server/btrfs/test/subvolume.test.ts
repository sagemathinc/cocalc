import { before, after, fs, sudo } from "./setup";
import { mkdir } from "fs/promises";
import { join } from "path";
import { wait } from "@cocalc/backend/conat/test/util";
import { randomBytes } from "crypto";
import { type Subvolume } from "../subvolume";

beforeAll(before);

describe("setting and getting quota of a subvolume", () => {
  let vol: Subvolume;
  it("set the quota of a subvolume to 5 M", async () => {
    vol = await fs.subvolumes.get("q");
    await vol.quota.set("5M");

    const { size, used } = await vol.quota.get();
    expect(size).toBe(5 * 1024 * 1024);
    expect(used).toBe(0);
  });

  it("get directory listing", async () => {
    const v = await vol.fs.ls("");
    expect(v).toEqual([]);
  });

  it("write a file and check usage goes up", async () => {
    const buf = randomBytes(4 * 1024 * 1024);
    await vol.fs.writeFile("buf", buf);
    await wait({
      until: async () => {
        await sudo({ command: "sync" });
        const { used } = await vol.quota.usage();
        return used > 0;
      },
    });
    const { used } = await vol.quota.usage();
    expect(used).toBeGreaterThan(0);

    const v = await vol.fs.ls("");
    // size is potentially random, reflecting compression
    expect(v).toEqual([{ name: "buf", mtime: v[0].mtime, size: v[0].size }]);
  });

  it("fail to write a 50MB file (due to quota)", async () => {
    const buf2 = randomBytes(50 * 1024 * 1024);
    expect(async () => {
      await vol.fs.writeFile("buf2", buf2);
    }).rejects.toThrow("write");
  });
});

describe("the filesystem operations", () => {
  let vol: Subvolume;

  it("creates a volume and get empty listing", async () => {
    vol = await fs.subvolumes.get("fs");
    expect(await vol.fs.ls("")).toEqual([]);
  });

  it("error listing non-existent path", async () => {
    vol = await fs.subvolumes.get("fs");
    expect(async () => {
      await vol.fs.ls("no-such-path");
    }).rejects.toThrow("ENOENT");
  });

  it("creates a text file to it", async () => {
    await vol.fs.writeFile("a.txt", "hello");
    const ls = await vol.fs.ls("");
    expect(ls).toEqual([{ name: "a.txt", mtime: ls[0].mtime, size: 5 }]);
  });

  it("read the file we just created as utf8", async () => {
    expect(await vol.fs.readFile("a.txt", "utf8")).toEqual("hello");
  });

  it("read the file we just created as a binary buffer", async () => {
    expect(await vol.fs.readFile("a.txt")).toEqual(Buffer.from("hello"));
  });

  it("stat the file we just created", async () => {
    const s = await vol.fs.stat("a.txt");
    expect(s.size).toBe(5);
    expect(Math.abs(s.mtimeMs - Date.now())).toBeLessThan(60_000);
  });

  let origStat;
  it("snapshot filesystem and see file is in snapshot", async () => {
    await vol.snapshots.create("snap");
    const s = await vol.fs.ls(vol.snapshots.path("snap"));
    expect(s).toEqual([{ name: "a.txt", mtime: s[0].mtime, size: 5 }]);

    const stat = await vol.fs.stat("a.txt");
    origStat = stat;
    expect(stat.mtimeMs / 1000).toBeCloseTo(s[0].mtime ?? 0);
  });

  it("unlink (delete) our file", async () => {
    await vol.fs.unlink("a.txt");
    expect(await vol.fs.ls("")).toEqual([]);
  });

  it("snapshot still exists", async () => {
    expect(await vol.fs.exists(vol.snapshots.path("snap", "a.txt")));
  });

  it("copy file from snapshot and note it has the same mode as before (so much nicer than what happens with zfs)", async () => {
    await vol.fs.copyFile(vol.snapshots.path("snap", "a.txt"), "a.txt");
    const stat = await vol.fs.stat("a.txt");
    expect(stat.mode).toEqual(origStat.mode);
  });

  it("create and copy a folder", async () => {
    await vol.fs.mkdir("my-folder");
    await vol.fs.writeFile("my-folder/foo.txt", "foo");
    await vol.fs.cp("my-folder", "folder2", { recursive: true });
    expect(await vol.fs.readFile("folder2/foo.txt", "utf8")).toEqual("foo");
  });

  it("append to a file", async () => {
    await vol.fs.writeFile("b.txt", "hell");
    await vol.fs.appendFile("b.txt", "-o");
    expect(await vol.fs.readFile("b.txt", "utf8")).toEqual("hell-o");
  });

  it("make a file readonly, then change it back", async () => {
    await vol.fs.writeFile("c.txt", "hi");
    await vol.fs.chmod("c.txt", "440");
    expect(async () => {
      await vol.fs.appendFile("c.txt", " there");
    }).rejects.toThrow("EACCES");
    await vol.fs.chmod("c.txt", "660");
    await vol.fs.appendFile("c.txt", " there");
  });

  it("realpath of a symlink", async () => {
    await vol.fs.writeFile("real.txt", "i am real");
    await vol.fs.symlink("real.txt", "link.txt");
    expect(await vol.fs.realpath("link.txt")).toBe("real.txt");
  });

  it("watch for changes", async () => {
    await vol.fs.writeFile("w.txt", "hi");
    const ac = new AbortController();
    const { signal } = ac;
    const watcher = await vol.fs.watch("w.txt", { signal });
    vol.fs.appendFile("w.txt", " there");
    // @ts-ignore
    const { value, done } = await watcher.next();
    expect(done).toBe(false);
    expect(value).toEqual({ eventType: "change", filename: "w.txt" });
    ac.abort();

    expect(async () => {
      // @ts-ignore
      await watcher.next();
    }).rejects.toThrow("aborted");
  });

  it("rename a file", async () => {
    await vol.fs.writeFile("old", "hi");
    await vol.fs.rename("old", "new");
    expect(await vol.fs.readFile("new", "utf8")).toEqual("hi");
  });

  it("create and remove a directory", async () => {
    await vol.fs.mkdir("path");
    await vol.fs.rmdir("path");
  });

  it("create a directory recursively and remove", async () => {
    await vol.fs.mkdir("path/to/stuff", { recursive: true });
    await vol.fs.rm("path", { recursive: true });
  });
});

describe("test snapshots", () => {
  let vol: Subvolume;

  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolumes.get("snapper");
    expect(await vol.snapshots.hasUnsavedChanges()).toBe(false);
    await vol.fs.writeFile("a.txt", "hello");
    expect(await vol.snapshots.hasUnsavedChanges()).toBe(true);
  });

  it("snapshot the volume", async () => {
    expect(await vol.snapshots.ls()).toEqual([]);
    await vol.snapshots.create("snap1");
    expect((await vol.snapshots.ls()).map((x) => x.name)).toEqual(["snap1"]);
    expect(await vol.snapshots.hasUnsavedChanges()).toBe(false);
  });

  it("create a file see that we know there are unsaved changes", async () => {
    await vol.fs.writeFile("b.txt", "world");
    await sudo({ command: "sync" });
    expect(await vol.snapshots.hasUnsavedChanges()).toBe(true);
  });

  it("delete our file, but then read it in a snapshot", async () => {
    await vol.fs.unlink("a.txt");
    const b = await vol.fs.readFile(
      vol.snapshots.path("snap1", "a.txt"),
      "utf8",
    );
    expect(b).toEqual("hello");
  });

  it("verifies snapshot exists", async () => {
    expect(await vol.snapshots.exists("snap1")).toBe(true);
    expect(await vol.snapshots.exists("snap2")).toBe(false);
  });

  it("lock our snapshot and confirm it prevents deletion", async () => {
    await vol.snapshots.lock("snap1");
    expect(async () => {
      await vol.snapshots.delete("snap1");
    }).rejects.toThrow("locked");
  });

  it("unlock our snapshot and delete it", async () => {
    await vol.snapshots.unlock("snap1");
    await vol.snapshots.delete("snap1");
    expect(await vol.snapshots.exists("snap1")).toBe(false);
    expect(await vol.snapshots.ls()).toEqual([]);
  });
});

describe("test bup backups", () => {
  let vol: Subvolume;
  it("creates a volume", async () => {
    vol = await fs.subvolumes.get("bup-test");
    await vol.fs.writeFile("a.txt", "hello");
  });

  it("create a bup backup", async () => {
    await vol.bup.save();
  });

  it("list bup backups of this vol -- there are 2, one for the date and 'latest'", async () => {
    const v = await vol.bup.ls();
    expect(v.length).toBe(2);
    const t = (v[0].mtime ?? 0) * 1000;
    expect(Math.abs(t.valueOf() - Date.now())).toBeLessThan(10_000);
  });

  it("confirm a.txt is in our backup", async () => {
    const x = await vol.bup.ls("latest");
    expect(x).toEqual([
      { name: "a.txt", size: 5, mtime: x[0].mtime, isdir: false },
    ]);
  });

  it("restore a.txt from our backup", async () => {
    await vol.fs.writeFile("a.txt", "hello2");
    await vol.bup.restore("latest/a.txt");
    expect(await vol.fs.readFile("a.txt", "utf8")).toEqual("hello");
  });

  it("prune bup backups does nothing since we have so few", async () => {
    await vol.bup.prune();
    expect((await vol.bup.ls()).length).toBe(2);
  });

  it("add a directory and back up", async () => {
    await mkdir(join(vol.path, "mydir"));
    await vol.fs.writeFile(join("mydir", "file.txt"), "hello3");
    expect((await vol.fs.ls("mydir"))[0].name).toBe("file.txt");
    await vol.bup.save();
    const x = await vol.bup.ls("latest");
    expect(x).toEqual([
      { name: "a.txt", size: 5, mtime: x[0].mtime, isdir: false },
      { name: "mydir", size: 0, mtime: x[1].mtime, isdir: true },
    ]);
    expect(Math.abs((x[0].mtime ?? 0) * 1000 - Date.now())).toBeLessThan(
      5 * 60_000,
    );
  });

  it("change file in the directory, then restore from backup whole dir", async () => {
    await vol.fs.writeFile(join("mydir", "file.txt"), "changed");
    await vol.bup.restore("latest/mydir");
    expect(await vol.fs.readFile(join("mydir", "file.txt"), "utf8")).toEqual(
      "hello3",
    );
  });

  it("most recent snapshot has a backup before the restore", async () => {
    const s = await vol.snapshots.ls();
    const recent = s.slice(-1)[0].name;
    const p = vol.snapshots.path(recent, "mydir", "file.txt");
    expect(await vol.fs.readFile(p, "utf8")).toEqual("changed");
  });
});

afterAll(after);
