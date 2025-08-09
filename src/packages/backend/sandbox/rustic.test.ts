/*
Test the rustic backup api.

https://github.com/rustic-rs/rustic
*/

import rustic from "./rustic";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let tempDir, options;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
  const repo = join(tempDir, "repo");
  const home = join(tempDir, "home");
  await mkdir(home);
  const safeAbsPath = (path: string) => join(home, resolve("/", path));
  options = {
    host: "my-host",
    repo,
    safeAbsPath,
  };
});
afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("rustic does something", () => {
  it("there are initially no backups", async () => {
    const { stdout, truncated } = await rustic(
      ["snapshots", "--json"],
      options,
    );
    const s = JSON.parse(Buffer.from(stdout).toString());
    expect(s).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("create a file and back it up", async () => {
    await writeFile(join(tempDir, "a.txt"), "hello");
    const { stdout, truncated } = await rustic(
      ["backup", "--json", "a.txt"],
      options,
    );
    const s = JSON.parse(Buffer.from(stdout).toString());
    expect(s.paths).toEqual(["a.txt"]);
    expect(truncated).toBe(false);
  });

  //   it("it appears in the snapshots list", async () => {
  //     const { stdout, truncated } = await rustic(
  //       ["snapshots", "--json"],
  //       options,
  //     );
  //     const s = JSON.parse(Buffer.from(stdout).toString());
  //     expect(s).toEqual([]);
  //     expect(truncated).toBe(false);
  //   });
});
