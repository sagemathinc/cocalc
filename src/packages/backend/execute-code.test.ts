import { executeCode } from "./execute-code";

describe("hello world", () => {
  it("runs hello world", async () => {
    const { stdout } = await executeCode({
      command: "echo",
      args: ["hello world"],
    });
    expect(stdout).toBe("hello world\n");
  });
});

describe("tests involving bash mode", () => {
  it("runs normal code in bash", async () => {
    const { stdout } = await executeCode({ command: "echo 'abc' | wc -c" });
    // on GitHub actions the output of wc is different than on other machines,
    // so we normalize by trimming.
    expect(stdout.trim()).toBe("4");
  });

  it("reports missing executable in non-bash mode", async () => {
    try {
      await executeCode({
        command: "this_does_not_exist",
        args: ["nothing"],
        bash: false,
      });
    } catch (err) {
      expect(err).toContain("ENOENT");
    }
  });

  it("reports missing executable in non-bash mode when ignoring on exit", async () => {
    try {
      await executeCode({
        command: "this_does_not_exist",
        args: ["nothing"],
        err_on_exit: false,
        bash: false,
      });
    } catch (err) {
      expect(err).toContain("ENOENT");
    }
  });

  it("ignores errors otherwise if err_on_exit is false", async () => {
    const { stdout, stderr, exit_code } = await executeCode({
      command: "sh",
      args: ["-c", "echo foo; exit 42"],
      err_on_exit: false,
      bash: false,
    });
    expect(stdout).toBe("foo\n");
    expect(stderr).toBe("");
    expect(exit_code).toBe(42);
  });
});

describe("test timeout", () => {
  it("kills if timeout reached", async () => {
    const t = Date.now();
    try {
      await executeCode({ command: "sleep 60", timeout: 0.1 });
      expect(false).toBe(true);
    } catch (err) {
      expect(err).toContain("killed command");
      expect(Date.now() - t).toBeGreaterThan(90);
      expect(Date.now() - t).toBeLessThan(500);
    }
  });

  it("doesn't kill when timeout not reached", async () => {
    const t = Date.now();
    await executeCode({ command: "sleep 0.1", timeout: 0.5 });
    expect(Date.now() - t).toBeGreaterThan(90);
  });

  it("kills in non-bash mode if timeout reached", async () => {
    try {
      await executeCode({
        command: "sh",
        args: ["-c", "sleep 5"],
        bash: false,
        timeout: 0.1,
      });
      expect(false).toBe(true);
    } catch (err) {
      expect(err).toContain("killed command");
    }
  });
});

describe("async", () => {
  it("use ID for async execution", async () => {
    const retID = await executeCode({
      command: "sh",
      args: ["-c", "sleep .1; echo foo;"],
      bash: false,
      timeout: 10,
      async_exec: true,
    });
    const id = retID["async_id"];
    expect(typeof id).toEqual("string");
    if (typeof id === "string") {
      await new Promise((done) => setTimeout(done, 1000));
      const status = await executeCode({ async_get: id });
      console.log("status", status);
      expect(status.stdout).toEqual("foo\n");
      expect(status.elapsed_s).toBeGreaterThan(0.1);
    }
  });
});
