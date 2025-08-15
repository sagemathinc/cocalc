import find from "./find";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";


let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
});
afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});


jest.setTimeout(15000);
describe("find files", () => {
  it("directory starts empty", async () => {
    const { stdout, truncated } = await find(tempDir, {
      options: ["-maxdepth", "1", "-mindepth", "1", "-printf", "%f\n"],
    });
    expect(stdout.length).toBe(0);
    expect(truncated).toBe(false);
  });

  it("create a file and see it appears in find", async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stdout, truncated } = await find(tempDir, {
      options: ["-maxdepth", "1", "-mindepth", "1", "-printf", "%f\n"],
    });
    expect(truncated).toBe(false);
    expect(stdout.toString()).toEqual("a.txt\n");
  });

  it("find files matching a given pattern", async () => {
    await writeFile(join(tempDir, "pattern"), "");
    await mkdir(join(tempDir, "blue"));
    await writeFile(join(tempDir, "blue", "Patton"), "");
    const { stdout } = await find(tempDir, {
      options: [
        "-maxdepth",
        "1",
        "-mindepth",
        "1",
        "-iname",
        "patt*",
        "-printf",
        "%f\n",
      ],
    });
    const v = stdout.toString().trim().split("\n");
    expect(new Set(v)).toEqual(new Set(["pattern"]));
  });

  it("find file in a subdirectory too", async () => {
    const { stdout } = await find(tempDir, {
      options: ["-iname", "patt*", "-printf", "%P\n"],
    });
    const w = stdout.toString().trim().split("\n");
    expect(new Set(w)).toEqual(new Set(["pattern", "blue/Patton"]));
  });

  // this is NOT a great test, unfortunately.
  const count = 5000;
  it(`hopefully exceed the timeout by creating ${count} files`, async () => {
    for (let i = 0; i < count; i++) {
      await writeFile(join(tempDir, `${i}`), "");
    }
    const t = Date.now();
    const { stdout, truncated } = await find(tempDir, {
      options: ["-printf", "%f\n"],
      timeout: 0.002,
    });

    expect(truncated).toBe(true);
    expect(Date.now() - t).toBeGreaterThan(1);

    const { stdout: stdout2 } = await find(tempDir, {
      options: ["-maxdepth", "1", "-mindepth", "1", "-printf", "%f\n"],
    });
    expect(stdout2.length).toBeGreaterThan(stdout.length);
  });
});
