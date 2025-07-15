import { before, after, fs } from "./setup";
import { writeFile } from "fs/promises";
import { join } from "path";
import { delay } from "awaiting";
import { wait } from "@cocalc/backend/conat/test/util";
import { randomBytes } from "crypto";

beforeAll(before);

jest.setTimeout(20000);
describe("setting and getting quota of a subvolume", () => {
  let vol;
  it("set the quota of a subvolume to 5 M", async () => {
    vol = await fs.subvolume("q");
    await vol.size("5M");

    const { size, used } = await vol.quota();
    expect(size).toBe(5 * 1024 * 1024);
    expect(used).toBe(0);
  });

  it("write a file and check usage goes up", async () => {
    const buf = randomBytes(4 * 1024 * 1024);
    await writeFile(join(vol.path, "buf"), buf);
    await wait({
      until: async () => {
        await delay(1000);
        const { used } = await vol.usage();
        return used > 0;
      },
    });
    const { used } = await vol.usage();
    expect(used).toBeGreaterThan(0);
  });

  it("fail to write a 50MB file (due to quota)", async () => {
    const buf2 = randomBytes(50 * 1024 * 1024);
    const b = join(vol.path, "buf2");
    expect(async () => {
      await writeFile(b, buf2);
    }).rejects.toThrow("write");
  });
});

afterAll(after);
