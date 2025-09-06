import dust from "./dust";
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

describe("dust works", () => {
  it("directory starts empty - no results", async () => {
    const { stdout, truncated } = await dust(tempDir, { options: ["-j"] });
    const s = JSON.parse(Buffer.from(stdout).toString());
    expect(s).toEqual({ children: [], name: tempDir, size: s.size });
    expect(truncated).toBe(false);
  });

  it("create a file and see it appears in the dust result", async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stdout, truncated } = await dust(tempDir, { options: ["-j"] });
    const s = JSON.parse(Buffer.from(stdout).toString());
    expect(s).toEqual({
      size: s.size,
      name: tempDir,
      children: [
        {
          size: s.children[0].size,
          name: join(tempDir, "a.txt"),
          children: [],
        },
      ],
    });
    expect(truncated).toBe(false);
  });
});
