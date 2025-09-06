import ripgrep from "./ripgrep";
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

describe("ripgrep files", () => {
  it("directory starts empty - no results", async () => {
    const { stdout, truncated } = await ripgrep(tempDir, "");
    expect(stdout.length).toBe(0);
    expect(truncated).toBe(false);
  });

  it("create a file and see it appears in the rigrep result", async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stdout, truncated } = await ripgrep(tempDir, "he");
    expect(truncated).toBe(false);
    expect(stdout.toString()).toEqual("a.txt:hello\n");
  });
});
