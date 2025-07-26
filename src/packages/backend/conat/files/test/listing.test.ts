import { SandboxedFilesystem } from "@cocalc/backend/files/sandbox";
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

  it("modify the file and get two updates -- one when it starts and another when done", async () => {
    await fs.appendFile("a.txt", " there");
    const { value } = await iter.next();
    expect(value).toEqual({ mtime: value.mtime, name: "a.txt", size: 5 });
    const { value: value2 } = await iter.next();
    expect(value2).toEqual({ mtime: value2.mtime, name: "a.txt", size: 11 });
    const stat = await fs.stat("a.txt");
    expect(stat.mtimeMs).toEqual(value2.mtime);
    expect(dir.files["a.txt"]).toEqual({ mtime: value2.mtime, size: 11 });
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
    const values: string[] = [];
    while (true) {
      const { value } = await iter.next();
      if (value == "a.txt") {
        continue;
      }
      values.push(value);
      if (value.name == `${count - 1}`) {
        break;
      }
    }
    expect(new Set(values).size).toEqual(count);

    expect(Object.keys(dir.files).length).toEqual(n + count);
  });

  it("cleans up", () => {
    dir.close();
  });
});
