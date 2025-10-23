import { before, after, fs } from "./setup";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { type Subvolume } from "../subvolume";

const DEBUG = false;
const log = DEBUG ? console.log : (..._args) => {};

const numSnapshots = 25;
const numFiles = 1000;

beforeAll(before);

describe(`stress test creating ${numSnapshots} snapshots`, () => {
  let vol: Subvolume;
  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolumes.get("stress");
  });

  it(`create file and snapshot the volume ${numSnapshots} times`, async () => {
    const snaps: string[] = [];
    const start = Date.now();
    for (let i = 0; i < numSnapshots; i++) {
      await writeFile(join(vol.path, `${i}.txt`), "world");
      await vol.snapshots.create(`snap${i}`);
      snaps.push(`snap${i}`);
    }
    log(
      `created ${Math.round((numSnapshots / (Date.now() - start)) * 1000)} snapshots per second in serial`,
    );
    snaps.sort();
    expect(
      (await vol.snapshots.readdir()).filter((x) => !x.startsWith(".")).sort(),
    ).toEqual(snaps.sort());
  });

  it(`delete our ${numSnapshots} snapshots`, async () => {
    for (let i = 0; i < numSnapshots; i++) {
      await vol.snapshots.delete(`snap${i}`);
    }
    expect(await vol.snapshots.readdir()).toEqual([]);
  });
});

describe(`create ${numFiles} files`, () => {
  let vol: Subvolume;
  it("creates a volume", async () => {
    vol = await fs.subvolumes.get("many-files");
  });

  it(`creates ${numFiles} files`, async () => {
    const names: string[] = [];
    const start = Date.now();
    for (let i = 0; i < numFiles; i++) {
      await writeFile(join(vol.path, `${i}`), "world");
      names.push(`${i}`);
    }
    log(
      `created ${Math.round((numFiles / (Date.now() - start)) * 1000)} files per second in serial`,
    );
    const v = await vol.fs.readdir("");
    expect(v.sort()).toEqual(names.sort());
  });

  it(`creates ${numFiles} files in parallel`, async () => {
    await mkdir(join(vol.path, "p"));
    const names: string[] = [];
    const start = Date.now();
    const z: any[] = [];
    for (let i = 0; i < numFiles; i++) {
      z.push(writeFile(join(vol.path, `p/${i}`), "world"));
      names.push(`${i}`);
    }
    await Promise.all(z);
    log(
      `created ${Math.round((numFiles / (Date.now() - start)) * 1000)} files per second in parallel`,
    );
    const t0 = Date.now();
    const w = await vol.fs.readdir("p");
    log("get listing of files took", Date.now() - t0, "ms");
    expect(w.sort()).toEqual(names.sort());
  });
});

afterAll(after);
