import { before, after, fs, sudo } from "./setup";
import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { wait } from "@cocalc/backend/conat/test/util";
import { randomBytes } from "crypto";
import { parseBupTime } from "../util";

beforeAll(before);

jest.setTimeout(20000);
describe("setting and getting quota of a subvolume", () => {
  let vol;
  it("set the quota of a subvolume to 5 M", async () => {
    vol = await fs.subvolume("q");
    await vol.size("5M");

    const { size, used } = await vol.quota();
    expect(size).toBe(5 * 1024 * 1024);
    expect(used).toBe(0);
  });

  it("write a file and check usage goes up", async () => {
    const buf = randomBytes(4 * 1024 * 1024);
    await writeFile(join(vol.path, "buf"), buf);
    await wait({
      until: async () => {
        await sudo({ command: "sync" });
        const { used } = await vol.usage();
        return used > 0;
      },
    });
    const { used } = await vol.usage();
    expect(used).toBeGreaterThan(0);
  });

  it("fail to write a 50MB file (due to quota)", async () => {
    const buf2 = randomBytes(50 * 1024 * 1024);
    const b = join(vol.path, "buf2");
    expect(async () => {
      await writeFile(b, buf2);
    }).rejects.toThrow("write");
  });
});

describe("test snapshots", () => {
  let vol;
  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolume("snapper");
    expect(await vol.hasUnsavedChanges()).toBe(false);
    await writeFile(join(vol.path, "a.txt"), "hello");
    expect(await vol.hasUnsavedChanges()).toBe(true);
  });

  it("snapshot the volume", async () => {
    expect(await vol.snapshots()).toEqual([]);
    await vol.createSnapshot("snap1");
    expect(await vol.snapshots()).toEqual(["snap1"]);
    expect(await vol.hasUnsavedChanges()).toBe(false);
  });

  it("create a file see that we know there are unsaved changes", async () => {
    await writeFile(join(vol.path, "b.txt"), "world");
    await sudo({ command: "sync" });
    expect(await vol.hasUnsavedChanges()).toBe(true);
  });

  it("delete our file, but then read it in a snapshot", async () => {
    await unlink(join(vol.path, "a.txt"));
    const b = await readFile(join(vol.snapshotsDir, "snap1", "a.txt"), "utf8");
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
    await writeFile(join(vol.path, "a.txt"), "hello");
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
      { path: "a.txt", size: 5, timestamp: x[0].timestamp, isdir: false },
    ]);
  });

  it("restore a.txt from our backup", async () => {
    await writeFile(join(vol.path, "a.txt"), "hello2");
    await vol.bupRestore("latest/a.txt");
    expect(await readFile(join(vol.path, "a.txt"), "utf8")).toEqual("hello");
  });

  it("prune bup backups does nothing since we have so few", async () => {
    await vol.bupPrune();
    expect((await vol.bupBackups()).length).toBe(2);
  });

  it("add a directory and back up", async () => {
    await mkdir(join(vol.path, "mydir"));
    await vol.createBupBackup();
    const x = await vol.bupLs("latest");
    expect(x).toEqual([
      { path: "a.txt", size: 5, timestamp: x[0].timestamp, isdir: false },
      { path: "mydir", size: 0, timestamp: x[1].timestamp, isdir: true },
    ]);
  });
});

afterAll(after);
