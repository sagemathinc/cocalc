import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalExecutor } from "../local";

describe("LocalExecutor", () => {
  let workspace: string;
  let exec: LocalExecutor;

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "local-exec-"));
    exec = new LocalExecutor(workspace);
  });

  afterAll(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("reads and writes inside the workspace", async () => {
    const relPath = "nested/hello.txt";
    const content = "hi there";

    await exec.writeTextFile(relPath, content);
    const stored = await fs.readFile(path.join(workspace, relPath), "utf8");
    expect(stored).toBe(content);

    const roundTrip = await exec.readTextFile(relPath);
    expect(roundTrip).toBe(content);
  });

  it("rejects path traversal outside the workspace", async () => {
    await expect(exec.readTextFile("../escape.txt")).rejects.toThrow(
      /escapes workspace/i,
    );
    await expect(exec.writeTextFile("../escape.txt", "x")).rejects.toThrow(
      /escapes workspace/i,
    );
  });

  it("executes commands relative to the workspace", async () => {
    const subdir = path.join(workspace, "sub");
    await fs.mkdir(subdir, { recursive: true });

    const { stdout, stderr, exitCode } = await exec.exec("pwd", {
      cwd: "sub",
    });
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(subdir);
  });

  it("runs shell features (env vars, pipes, escaping)", async () => {
    const { stdout, stderr, exitCode } = await exec.exec(
      'echo "$GREETING" | tr a-z A-Z | sed "s/ /-/"',
      { env: { GREETING: "hello world" } },
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("HELLO-WORLD");
  });

  it("surfaces failing commands with stderr", async () => {
    await expect(
      exec.exec("ls does-not-exist && echo should-not-run"),
    ).rejects.toThrow(/does-not-exist/);
  });
});
