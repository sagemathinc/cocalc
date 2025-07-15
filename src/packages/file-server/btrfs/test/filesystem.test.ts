import { before, after, fs } from "./setup";
import { isValidUUID } from "@cocalc/util/misc";

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
    expect(await fs.subvolumes.list()).toEqual([]);
  });
});

describe("operations with subvolumes", () => {
  it("can't use a reserved subvolume name", async () => {
    expect(async () => {
      await fs.subvolumes.get("bup");
    }).rejects.toThrow("is reserved");
  });

  it("creates a subvolume", async () => {
    const vol = await fs.subvolumes.get("cocalc");
    expect(vol.name).toBe("cocalc");
    // it has no snapshots
    expect(await vol.snapshots.ls()).toEqual([]);
  });

  it("our subvolume is in the list", async () => {
    expect(await fs.subvolumes.list()).toEqual(["cocalc"]);
  });

  it("create another two subvolumes", async () => {
    await fs.subvolumes.get("sagemath");
    await fs.subvolumes.get("a-math");
    // list is sorted:
    expect(await fs.subvolumes.list()).toEqual([
      "a-math",
      "cocalc",
      "sagemath",
    ]);
  });

  it("delete a subvolume", async () => {
    await fs.subvolumes.delete("a-math");
    expect(await fs.subvolumes.list()).toEqual(["cocalc", "sagemath"]);
  });

  it("clone a subvolume", async () => {
    await fs.subvolumes.clone("sagemath", "cython");
    expect(await fs.subvolumes.list()).toEqual([
      "cocalc",
      "cython",
      "sagemath",
    ]);
  });

  it("rsync from one volume to another", async () => {
    await fs.subvolumes.rsync({ src: "sagemath", target: "cython" });
  });

  it("rsync an actual file", async () => {
    const sagemath = await fs.subvolumes.get("sagemath");
    const cython = await fs.subvolumes.get("cython");
    await sagemath.fs.writeFile("README.md", "hi");
    await fs.subvolumes.rsync({ src: "sagemath", target: "cython" });
    const copy = await cython.fs.readFile("README.md", "utf8");
    expect(copy).toEqual("hi");
  });

  it("clone a subvolume with contents", async () => {
    await fs.subvolumes.clone("cython", "pyrex");
    const pyrex = await fs.subvolumes.get("pyrex");
    const clone = await pyrex.fs.readFile("README.md", "utf8");
    expect(clone).toEqual("hi");
  });
});

afterAll(after);
