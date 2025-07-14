import { before, after, fs } from "./setup";
import { isValidUUID } from "@cocalc/util/misc";
// import { readFile, writeFile } from "fs/promises";
// import { join } from "path";

beforeAll(before);

describe("some basic tests", () => {
  it("gets basic info", async () => {
    const info = await fs.info();
    expect(info).not.toEqual(null);
    expect(info.Name).toBe("<FS_TREE>");
    expect(isValidUUID(info.UUID)).toBe(true);
    const creation = new Date(info["Creation time"]);
    expect(Math.abs(creation.valueOf() - Date.now())).toBeLessThan(15000);
    expect(info["Snapshot(s)"]).toBe("");
  });

  it("lists the subvolumes (there are none)", async () => {
    expect(await fs.list()).toEqual([]);
  });
});

describe("operations with subvolumes", () => {
  it("can't use a reserved subvolume name", async () => {
    expect(async () => {
      await fs.subvolume("bup");
    }).rejects.toThrow("is reserved");
  });

  it("creates a subvolume", async () => {
    const vol = await fs.subvolume("cocalc");
    expect(vol.name).toBe("cocalc");
    // it has no snapshots
    expect(await vol.snapshots()).toEqual([]);
  });

  it("our subvolume is in the list", async () => {
    expect(await fs.list()).toEqual(["cocalc"]);
  });

  it("create another two subvolumes", async () => {
    await fs.subvolume("sagemath");
    await fs.subvolume("a-math");
    // list is sorted:
    expect(await fs.list()).toEqual(["a-math", "cocalc", "sagemath"]);
  });

  it("delete a subvolume", async () => {
    await fs.deleteSubvolume("a-math");
    expect(await fs.list()).toEqual(["cocalc", "sagemath"]);
  });

  it("clone a subvolume", async () => {
    await fs.cloneSubvolume("sagemath", "cython");
    expect(await fs.list()).toEqual(["cocalc", "cython", "sagemath"]);
  });

  it("rsync from one volume to another", async () => {
    await fs.rsync({ src: "sagemath", target: "cython" });
  });

  //   it("rsync with an actual file", async () => {
  //     const sagemath = await fs.subvolume("sagemath");
  //     const cython = await fs.subvolume("cython");
  //     await writeFile(join(sagemath.path, "README.md"), "hi");
  //     await fs.rsync({ src: "sagemath", target: "cython" });
  //     expect((await readFile(join(sagemath.path, "README.md")), "utf8")).toEqual(
  //       "hi",
  //     );
  //   });
});

afterAll(after);
