import find from "./find";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
});
afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("find files", () => {
  it("directory starts empty", async () => {
    const { stdout, truncated } = await find(tempDir, "%f\n");
    expect(stdout.length).toBe(0);
    expect(truncated).toBe(false);
  });

  it("create a file and see it appears in find", async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stdout, truncated } = await find(tempDir, "%f\n");
    expect(truncated).toBe(false);
    expect(stdout.toString()).toEqual("a.txt\n");
  });

  // this is NOT a great test, unfortunately.
  const count = 10000;
  it(`hopefully exceed the timeout by creating ${count} files`, async () => {
    for (let i = 0; i < count; i++) {
      await writeFile(join(tempDir, `${i}`), "");
    }
    const t = Date.now();
    const { stdout, truncated } = await find(tempDir, "%f\n", 2);
    expect(truncated).toBe(true);
    expect(Date.now() - t).toBeGreaterThan(1);

    const { stdout: stdout2 } = await find(tempDir, "%f\n");
    expect(stdout2.length).toBeGreaterThan(stdout.length);
  });
});
