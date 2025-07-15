import { before, after, fs } from "./setup";
import { writeFile } from "fs/promises";
import { join } from "path";

beforeAll(before);
//const log = console.log;
const log = (..._args) => {};

describe("stress test creating many snapshots", () => {
  let vol;
  it("creates a volume and write a file to it", async () => {
    vol = await fs.subvolume("stress");
  });

  const count = 25;
  it(`create file and snapshot the volume ${count} times`, async () => {
    const snaps: string[] = [];
    const start = Date.now();
    for (let i = 0; i < count; i++) {
      await writeFile(join(vol.path, `${i}.txt`), "world");
      await vol.createSnapshot(`snap${i}`);
      snaps.push(`snap${i}`);
    }
    log(
      `created ${Math.round((count / (Date.now() - start)) * 1000)} snapshots per second in serial`,
    );
    snaps.sort();
    expect(await vol.snapshots()).toEqual(snaps);
  });

  it(`delete our ${count} snapshots`, async () => {
    for (let i = 0; i < count; i++) {
      await vol.deleteSnapshot(`snap${i}`);
    }
    expect(await vol.snapshots()).toEqual([]);
  });
});

afterAll(after);
