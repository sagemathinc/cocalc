import { before, after, fs, sudo } from "./setup";
import { mkdir } from "fs/promises";
import { join } from "path";
import { wait } from "@cocalc/backend/conat/test/util";
import { randomBytes } from "crypto";
import { parseBupTime } from "../util";

beforeAll(before);

describe("setting and getting quota of a subvolume", () => {
  let vol;
  it("set the quota of a subvolume to 5 M", async () => {
    vol = await fs.subvolume("q");
    await vol.size("5M");

    const { size, used } = await vol.quota();
    expect(size).toBe(5 * 1024 * 1024);
    expect(used).toBe(0);
  });

  it("get directory listing", async () => {
    const v = await vol.ls("");
    expect(v).toEqual([]);
  });

  it("write a file and check usage goes up", async () => {
    const buf = randomBytes(4 * 1024 * 1024);
    await vol.writeFile("buf", buf);
    await wait({
      until: async () => {
        await sudo({ command: "sync" });
        const { used } = await vol.usage();
        return used > 0;
      },
    });
    const { used } = await vol.usage();
    expect(used).toBeGreaterThan(0);

    const v = await vol.ls("");
    // size is potentially random, reflecting compression
    expect(v).toEqual([{ name: "buf", mtime: v[0].mtime, size: v[0].size }]);
  });

  it("fail to write a 50MB file (due to quota)", async () => {
    const buf2 = randomBytes(50 * 1024 * 1024);
    expect(async () => {
      await vol.writeFile("buf2", buf2);
    }).rejects.toThrow("write");
  });
});

describe("test snapshots", () => {
  let vol;
  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolume("snapper");
    expect(await vol.hasUnsavedChanges()).toBe(false);
    await vol.writeFile("a.txt", "hello");
    expect(await vol.hasUnsavedChanges()).toBe(true);
  });

  it("snapshot the volume", async () => {
    expect(await vol.snapshots()).toEqual([]);
    await vol.createSnapshot("snap1");
    expect(await vol.snapshots()).toEqual(["snap1"]);
    expect(await vol.hasUnsavedChanges()).toBe(false);
  });

  it("create a file see that we know there are unsaved changes", async () => {
    await vol.writeFile("b.txt", "world");
    await sudo({ command: "sync" });
    expect(await vol.hasUnsavedChanges()).toBe(true);
  });

  it("delete our file, but then read it in a snapshot", async () => {
    await vol.unlink("a.txt");
    const b = await vol.readFile(vol.snapshotPath("snap1", "a.txt"), "utf8");
    expect(b).toEqual("hello");
  });

  it("verifies snapshot exists", async () => {
    expect(await vol.snapshotExists("snap1")).toBe(true);
    expect(await vol.snapshotExists("snap2")).toBe(false);
  });

  it("lock our snapshot and confirm it prevents deletion", async () => {
    await vol.lockSnapshot("snap1");
    expect(async () => {
      await vol.deleteSnapshot("snap1");
    }).rejects.toThrow("locked");
  });

  it("unlock our snapshot and delete it", async () => {
    await vol.unlockSnapshot("snap1");
    await vol.deleteSnapshot("snap1");
    expect(await vol.snapshotExists("snap1")).toBe(false);
    expect(await vol.snapshots()).toEqual([]);
  });
});

describe("test bup backups", () => {
  let vol;
  it("creates a volume", async () => {
    vol = await fs.subvolume("bup-test");
    await vol.writeFile("a.txt", "hello");
  });

  it("create a bup backup", async () => {
    await vol.createBupBackup();
  });

  it("list bup backups of this vol -- there are 2, one for the date and 'latest'", async () => {
    const v = await vol.bupBackups();
    expect(v.length).toBe(2);
    const t = parseBupTime(v[0]);
    expect(Math.abs(t.valueOf() - Date.now())).toBeLessThan(10_000);
  });

  it("confirm a.txt is in our backup", async () => {
    const x = await vol.bupLs("latest");
    expect(x).toEqual([
      { name: "a.txt", size: 5, mtime: x[0].mtime, isdir: false },
    ]);
  });

  it("restore a.txt from our backup", async () => {
    await vol.writeFile("a.txt", "hello2");
    await vol.bupRestore("latest/a.txt");
    expect(await vol.readFile("a.txt", "utf8")).toEqual("hello");
  });

  it("prune bup backups does nothing since we have so few", async () => {
    await vol.bupPrune();
    expect((await vol.bupBackups()).length).toBe(2);
  });

  it("add a directory and back up", async () => {
    await mkdir(join(vol.path, "mydir"));
    await vol.writeFile(join("mydir", "file.txt"), "hello3");
    expect((await vol.ls("mydir"))[0].name).toBe("file.txt");
    await vol.createBupBackup();
    const x = await vol.bupLs("latest");
    expect(x).toEqual([
      { name: "a.txt", size: 5, mtime: x[0].mtime, isdir: false },
      { name: "mydir", size: 0, mtime: x[1].mtime, isdir: true },
    ]);
    expect(Math.abs(x[0].mtime * 1000 - Date.now())).toBeLessThan(60_000);
  });

  it("change file in the directory, then restore from backup whole dir", async () => {
    await vol.writeFile(join("mydir", "file.txt"), "changed");
    await vol.bupRestore("latest/mydir");
    expect(await vol.readFile(join("mydir", "file.txt"), "utf8")).toEqual(
      "hello3",
    );
  });

  it("most recent snapshot has a backup before the restore", async () => {
    const s = await vol.snapshots();
    const recent = s.slice(-1)[0];
    const p = vol.snapshotPath(recent, "mydir", "file.txt");
    expect(await vol.readFile(p, "utf8")).toEqual("changed");
  });
});

afterAll(after);
