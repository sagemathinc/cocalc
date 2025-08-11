import { before, after, fs } from "./setup";
import { type Subvolume } from "../subvolume";

beforeAll(before);

const count = 10;
describe(`make backups of ${count} different volumes at the same time`, () => {
  const vols: Subvolume[] = [];
  it(`creates ${count} volumes`, async () => {
    for (let i = 0; i < count; i++) {
      const vol = await fs.subvolumes.get(`rustic-multi-${i}`);
      await vol.fs.writeFile(`a-${i}.txt`, `hello-${i}`);
      vols.push(vol);
    }
  });

  it(`create ${count} rustic backup in parallel`, async () => {
    await Promise.all(vols.map((vol) => vol.rustic.backup()));
  });

  it("delete file from each volume, then restore them all in parallel and confirm restore worked", async () => {
    const snapshots = await Promise.all(
      vols.map((vol) => vol.rustic.snapshots()),
    );
    const ids = snapshots.map((x) => x[0].id);
    for (let i = 0; i < count; i++) {
      await vols[i].fs.unlink(`a-${i}.txt`);
    }

    const v: any[] = [];
    for (let i = 0; i < count; i++) {
      v.push(vols[i].rustic.restore({ id: ids[i] }));
    }
    await Promise.all(v);

    for (let i = 0; i < count; i++) {
      const vol = vols[i];
      expect((await vol.fs.readFile(`a-${i}.txt`)).toString("utf8")).toEqual(
        `hello-${i}`,
      );
    }
  });
});

afterAll(after);
