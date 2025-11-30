/*
Test the exec command.
*/

import exec from "./exec";
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

describe("exec works", () => {
  it(`create file and run ls command`, async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stderr, stdout, truncated, code } = await exec({
      cmd: "ls",
      cwd: tempDir,
    });
    expect(code).toBe(0);
    expect(truncated).toBe(false);
    expect(stdout.toString()).toEqual("a.txt\n");
    expect(stderr.toString()).toEqual("");
  });
});
