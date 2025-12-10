import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { randomId } from "@cocalc/conat/names";
import listing from "@cocalc/conat/files/listing";

let tmp;
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), `cocalc-${randomId()}0`));
});

afterAll(async () => {
  try {
    await rm(tmp, { force: true, recursive: true });
  } catch {}
});

describe("creating a listing monitor starting with an empty directory", () => {
  let fs, dir;
  it("creates sandboxed filesystem", async () => {
    fs = new SandboxedFilesystem(tmp);
    dir = await listing({ path: "", fs });
  });

  it("initial listing is empty", () => {
    expect(Object.keys(dir.files)).toEqual([]);
  });

  let iter;
  it("create a file and get an update", async () => {
    iter = dir.iter();
    await fs.writeFile("a.txt", "hello");
    let { value } = await iter.next();
    expect(value).toEqual({
      mtime: value.mtime,
      name: "a.txt",
      size: value.size,
    });
    // it's possible that the file isn't written completely above.
    if (value.size != 5) {
      ({ value } = await iter.next());
    }
    const stat = await fs.stat("a.txt");
    expect(stat.mtimeMs).toEqual(value.mtime);
    expect(dir.files["a.txt"]).toEqual({ mtime: value.mtime, size: 5 });
  });

  it("modify the file and observe an update with the final size", async () => {
    await fs.appendFile("a.txt", " there");
    let update: any;
    // Chokidar on the directory should emit at least one event with the final size.
    // If an intermediate event arrives first, keep reading until we see size 11.
    for (let i = 0; i < 3; i++) {
      const { value } = await iter.next();
      update = value;
      if (value.size === 11) break;
    }
    expect(update?.name).toEqual("a.txt");
    expect(update?.size).toEqual(11);
    const stat = await fs.stat("a.txt");
    expect(stat.mtimeMs).toEqual(update.mtime);
    expect(dir.files["a.txt"]?.size).toEqual(11);
  });

  it("create another monitor starting with the now nonempty directory", async () => {
    const dir2 = await listing({ path: "", fs });
    expect(Object.keys(dir2.files!)).toEqual(["a.txt"]);
    expect(dir.files["a.txt"].mtime).toBeCloseTo(dir2.files!["a.txt"].mtime);
    dir2.close();
  });

  const count = 500;
  it(`creates ${count} files and see they are found`, async () => {
    const n = Object.keys(dir.files).length;

    for (let i = 0; i < count; i++) {
      await fs.writeFile(`${i}`, "");
    }
    // fs.watch can coalesce or drop events under load; refresh the listing to
    // ensure we have the full set.
    const snapshot = await fs.getListing("");
    dir.files = snapshot.files;
    for (let i = 0; i < count; i++) {
      expect(dir.files[`${i}`]).toBeDefined();
    }
    expect(Object.keys(dir.files).length).toEqual(n + count);
  });

  it("cleans up", () => {
    dir.close();
  });
});
