import { before, after, fs } from "./setup";
import { type Subvolume } from "../subvolume";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";

beforeAll(before);

describe("test rustic backups", () => {
  let vol: Subvolume;
  it("creates a volume", async () => {
    vol = await fs.subvolumes.get("rustic-test");
    await vol.fs.writeFile("a.txt", "hello");
  });

  let x;
  it("create a rustic backup", async () => {
    x = await vol.rustic.backup();
  });

  it("confirm a.txt is in our backup", async () => {
    const v = await vol.rustic.snapshots();
    expect(v.length == 1);
    expect(v[0]).toEqual(x);
    expect(Math.abs(Date.now() - v[0].time.valueOf())).toBeLessThan(10000);
    const { id } = v[0];
    const w = await vol.rustic.ls({ id });
    expect(w).toEqual([SNAPSHOTS, "a.txt"]);
  });

  it("delete a.txt, then restore it from the backup", async () => {
    await vol.fs.unlink("a.txt");
    const { id } = (await vol.rustic.snapshots())[0];
    await vol.rustic.restore({ id });
    expect((await vol.fs.readFile("a.txt")).toString("utf8")).toEqual("hello");
  });

  it("create a directory, make second backup, delete directory, then restore it from backup, and also restore just one file", async () => {
    await vol.fs.mkdir("my-dir");
    await vol.fs.writeFile("my-dir/file.txt", "hello");
    await vol.fs.writeFile("my-dir/file2.txt", "hello2");
    await vol.rustic.backup();
    const v = await vol.rustic.snapshots();
    expect(v.length == 2);
    const { id } = v[1];
    const w = await vol.rustic.ls({ id });
    expect(w).toEqual([
      SNAPSHOTS,
      "a.txt",
      "my-dir",
      "my-dir/file.txt",
      "my-dir/file2.txt",
    ]);
    await vol.fs.rm("my-dir", { recursive: true });

    // rustic all, including the path we just deleted
    await vol.rustic.restore({ id });
    expect((await vol.fs.readFile("my-dir/file.txt")).toString("utf8")).toEqual(
      "hello",
    );

    // restore just one specific file overwriting current version
    await vol.fs.unlink("my-dir/file2.txt");
    await vol.fs.writeFile("my-dir/file.txt", "changed");
    await vol.rustic.restore({ id, path: "my-dir/file2.txt" });
    expect(
      (await vol.fs.readFile("my-dir/file2.txt")).toString("utf8"),
    ).toEqual("hello2");

    // forget the second snapshot
    await vol.rustic.forget({ id });
    const v2 = await vol.rustic.snapshots();
    expect(v2.length).toBe(1);
    expect(v2[0].id).not.toEqual(id);
  });
});

afterAll(after);
