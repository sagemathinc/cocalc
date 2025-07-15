import { before, after, fs } from "./setup";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const DEBUG = false;
const log = DEBUG ? console.log : (..._args) => {};

const numSnapshots = 25;
const numFiles = 1000;

beforeAll(before);

describe(`stress test creating ${numSnapshots} snapshots`, () => {
  let vol;
  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolume("stress");
  });

  it(`create file and snapshot the volume ${numSnapshots} times`, async () => {
    const snaps: string[] = [];
    const start = Date.now();
    for (let i = 0; i < numSnapshots; i++) {
      await writeFile(join(vol.path, `${i}.txt`), "world");
      await vol.createSnapshot(`snap${i}`);
      snaps.push(`snap${i}`);
    }
    log(
      `created ${Math.round((numSnapshots / (Date.now() - start)) * 1000)} snapshots per second in serial`,
    );
    snaps.sort();
    expect(await vol.snapshots()).toEqual(snaps);
  });

  it(`delete our ${numSnapshots} snapshots`, async () => {
    for (let i = 0; i < numSnapshots; i++) {
      await vol.deleteSnapshot(`snap${i}`);
    }
    expect(await vol.snapshots()).toEqual([]);
  });
});

describe(`create ${numFiles} files`, () => {
  let vol;
  it("creates a volume", async () => {
    vol = await fs.subvolume("many-files");
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
    const v = await vol.ls("");
    const w = v.map(({ name }) => name);
    expect(w.sort()).toEqual(names.sort());
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
    const v = await vol.ls("p");
    log("get listing of files took", Date.now() - t0, "ms");
    const w = v.map(({ name }) => name);
    expect(w.sort()).toEqual(names.sort());
  });
});

afterAll(after);
