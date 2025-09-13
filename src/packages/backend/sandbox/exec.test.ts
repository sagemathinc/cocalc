/*
Test the exec command.
*/

import exec from "./exec";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nsjail, exists } from "./install";

const log = process.env.VERBOSE ? console.log : (..._args) => {};

let haveJail;
let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc"));
  haveJail = await exists(nsjail);
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

  if (haveJail) {
    it("run ls in a jail", async () => {
      const { stdout, truncated, code } = await exec({
        cmd: "/usr/bin/ls",
        nsjail: [
          "-Mo",
          "-R",
          "/lib64",
          "-R",
          "/lib",
          "-R",
          "/usr",
          "-B",
          tempDir,
          "--cwd",
          tempDir,
        ],
      });
      expect(code).toBe(0);
      expect(truncated).toBe(false);
      expect(stdout.toString()).toEqual("a.txt\n");
    });

    it("ls in a jail sees only a small amount of the filesystem", async () => {
      const { stdout, truncated, code } = await exec({
        cmd: "/usr/bin/ls",
        positionalArgs: ["/"],
        nsjail: [
          "-Mo",
          "-R",
          "/lib64",
          "-R",
          "/lib",
          "-R",
          "/usr",
          "-B",
          tempDir,
          "--cwd",
          tempDir,
        ],
      });
      expect(code).toBe(0);
      expect(truncated).toBe(false);
      expect(stdout.toString()).toEqual("lib\nlib64\nproc\ntmp\nusr\n");
    });

    const jailCount = 200;
    it(`Benchmark: run ls in a jail and not in a jail ${jailCount} times and check that the overhead is minimal`, async () => {
      const t0 = Date.now();
      for (let i = 0; i < jailCount; i++) {
        await exec({
          cmd: "ls",
          cwd: tempDir,
        });
      }
      const nonJailTime = Date.now() - t0;
      const nonJailRate = Math.ceil((jailCount / nonJailTime) * 1000);
      log(`No Jail: ${nonJailRate} calls per second`);
      expect(nonJailRate).toBeGreaterThan(10);

      const t1 = Date.now();
      for (let i = 0; i < jailCount; i++) {
        await exec({
          cmd: "/usr/bin/ls",
          nsjail: [
            "-Mo",
            "-R",
            "/lib64",
            "-R",
            "/lib",
            "-R",
            "/usr",
            "-B",
            tempDir,
            "--cwd",
            tempDir,
          ],
        });
      }
      const jailTime = Date.now() - t1;
      const jailRate = Math.ceil((jailCount / jailTime) * 1000);
      log(`Jail: ${jailRate} calls per second`);
      expect(jailRate).toBeGreaterThan(10);

      const jailOverhead = (jailTime - nonJailTime) / jailCount;
      log(`Jail Overhead is ${jailOverhead} ms per call`);
    });
  }
});
