import { before, after, fs } from "./setup";

beforeAll(before);

const DEBUG = false;
const log = DEBUG ? console.log : (..._args) => {};

describe("stress operations with subvolumes", () => {
  const count1 = 10;
  it(`create ${count1} subvolumes in serial`, async () => {
    const t = Date.now();
    for (let i = 0; i < count1; i++) {
      await fs.subvolumes.get(`${i}`);
    }
    log(
      `created ${Math.round((count1 / (Date.now() - t)) * 1000)} subvolumes per second serial`,
    );
  });

  it("list them and confirm", async () => {
    const v = await fs.subvolumes.list();
    expect(v.length).toBe(count1);
  });

  let count2 = 10;
  it(`create ${count2} subvolumes in parallel`, async () => {
    const v: any[] = [];
    const t = Date.now();
    for (let i = 0; i < count2; i++) {
      v.push(fs.subvolumes.get(`p-${i}`));
    }
    await Promise.all(v);
    log(
      `created ${Math.round((count2 / (Date.now() - t)) * 1000)} subvolumes per second in parallel`,
    );
  });

  it("list them and confirm", async () => {
    const v = await fs.subvolumes.list();
    expect(v.length).toBe(count1 + count2);
  });

  it("write a file to each volume", async () => {
    for (const name of await fs.subvolumes.list()) {
      const vol = await fs.subvolumes.get(name);
      await vol.fs.writeFile("a.txt", "hi");
    }
  });

  it("clone the first group in serial", async () => {
    await fs.sync(); // needed on github actions
    const t = Date.now();
    for (let i = 0; i < count1; i++) {
      await fs.subvolumes.clone(`${i}`, `clone-of-${i}`);
    }
    log(
      `cloned ${Math.round((count1 / (Date.now() - t)) * 1000)} subvolumes per second serial`,
    );
  });

  it("clone the second group in parallel", async () => {
    await fs.sync(); // needed on github actions
    const t = Date.now();
    const v: any[] = [];
    for (let i = 0; i < count2; i++) {
      v.push(fs.subvolumes.clone(`p-${i}`, `clone-of-p-${i}`));
    }
    await Promise.all(v);
    log(
      `cloned ${Math.round((count2 / (Date.now() - t)) * 1000)} subvolumes per second parallel`,
    );
  });

  it("delete the first batch serial", async () => {
    const t = Date.now();
    for (let i = 0; i < count1; i++) {
      await fs.subvolumes.delete(`${i}`);
    }
    log(
      `deleted ${Math.round((count1 / (Date.now() - t)) * 1000)} subvolumes per second serial`,
    );
  });

  it("delete the second batch in parallel", async () => {
    const v: any[] = [];
    const t = Date.now();
    for (let i = 0; i < count2; i++) {
      v.push(fs.subvolumes.delete(`p-${i}`));
    }
    await Promise.all(v);
    log(
      `deleted ${Math.round((count2 / (Date.now() - t)) * 1000)} subvolumes per second in parallel`,
    );
  });

  it("everything should be gone except the clones", async () => {
    await fs.sync();
    const v = await fs.subvolumes.list();
    expect(v.length).toBe(count1 + count2);
  });
});

afterAll(after);
