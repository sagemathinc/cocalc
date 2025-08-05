/*
Test the ouch compression api.
*/

import ouch from "./ouch";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { exists } from "@cocalc/backend/misc/async-utils-node";

let tempDir, options;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
  options = { cwd: tempDir };
});
afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("ouch works on a little file", () => {
  for (const ext of [
    "zip",
    "7z",
    "tar.gz",
    "tar.xz",
    "tar.bz",
    "tar.bz2",
    "tar.bz3",
    "tar.lz4",
    "tar.sz",
    "tar.zst",
    "tar.br",
  ]) {
    it(`create file and compress it up using ${ext}`, async () => {
      await writeFile(join(tempDir, "a.txt"), "hello");
      const { truncated, code } = await ouch(
        ["compress", "a.txt", `a.${ext}`],
        options,
      );
      expect(code).toBe(0);
      expect(truncated).toBe(false);
      expect(await exists(join(tempDir, `a.${ext}`))).toBe(true);
    });

    it(`extract ${ext} in subdirectory`, async () => {
      await mkdir(join(tempDir, `target-${ext}`));
      const { code } = await ouch(["decompress", join(tempDir, `a.${ext}`)], {
        cwd: join(tempDir, `target-${ext}`),
      });
      expect(code).toBe(0);
      expect(
        (await readFile(join(tempDir, `target-${ext}`, "a.txt"))).toString(),
      ).toEqual("hello");
    });
  }
});
