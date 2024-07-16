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

describe("test env", () => {
  it("allows to specify environment variables", async () => {
    const { stdout, stderr } = await executeCode({
      command: "sh",
      args: ["-c", "echo $FOO;"],
      err_on_exit: false,
      bash: false,
      env: { FOO: "bar" },
    });
    expect(stdout).toBe("bar\n");
    expect(stderr).toBe("");
  });
});

describe("async", () => {
  it("use ID to get async result", async () => {
    const c = await executeCode({
      command: "sh",
      args: ["-c", "echo foo; sleep .5; echo bar; sleep .5; echo baz;"],
      bash: false,
      timeout: 10,
      async_call: true,
    });
    expect(c.type).toEqual("async");
    if (c.type !== "async") return;
    const { status, start, job_id } = c;
    expect(status).toEqual("running");
    expect(start).toBeGreaterThan(1);
    expect(typeof job_id).toEqual("string");
    if (typeof job_id !== "string") return;
    await new Promise((done) => setTimeout(done, 250));
    {
      const s = await executeCode({ async_get: job_id });
      expect(s.type).toEqual("async");
      if (s.type !== "async") return;
      expect(s.status).toEqual("running");
      // partial stdout result
      expect(s.stdout).toEqual("foo\n");
      expect(s.elapsed_s).toBeUndefined();
      expect(s.start).toBeGreaterThan(1);
      expect(s.exit_code).toEqual(0);
    }

    await new Promise((done) => setTimeout(done, 900));
    {
      const s = await executeCode({ async_get: job_id });
      expect(s.type).toEqual("async");
      if (s.type !== "async") return;
      expect(s.status).toEqual("completed");
      expect(s.stdout).toEqual("foo\nbar\nbaz\n");
      expect(s.elapsed_s).toBeGreaterThan(0.1);
      expect(s.elapsed_s).toBeLessThan(3);
      expect(s.start).toBeGreaterThan(1);
      expect(s.stderr).toEqual("");
      expect(s.exit_code).toEqual(0);
    }
  });

  it("with an error", async () => {
    const c = await executeCode({
      command: ">&2 echo baz; exit 3",
      bash: true,
      async_call: true,
    });
    expect(c.type).toEqual("async");
    if (c.type !== "async") return;
    const { job_id } = c;
    expect(typeof job_id).toEqual("string");
    if (typeof job_id !== "string") return;
    await new Promise((done) => setTimeout(done, 250));
    const s = await executeCode({ async_get: job_id });
    expect(s.type).toEqual("async");
    if (s.type !== "async") return;
    expect(s.status).toEqual("error");
    expect(s.stdout).toEqual("");
    expect(s.stderr).toEqual("baz\n");
    // any error is code 1 it seems?
    expect(s.exit_code).toEqual(1);
  });

  it("trigger a timeout", async () => {
    const c = await executeCode({
      command: "sh",
      args: ["-c", "echo foo; sleep 1; echo bar;"],
      bash: false,
      timeout: 0.1,
      async_call: true,
    });
    expect(c.type).toEqual("async");
    if (c.type !== "async") return;
    const { status, start, job_id } = c;
    expect(status).toEqual("running");
    expect(start).toBeGreaterThan(1);
    expect(typeof job_id).toEqual("string");
    if (typeof job_id !== "string") return;
    await new Promise((done) => setTimeout(done, 250));
    const s = await executeCode({ async_get: job_id });
    expect(s.type).toEqual("async");
    if (s.type !== "async") return;
    expect(s.status).toEqual("error");
    expect(s.stdout).toEqual("");
    expect(s.elapsed_s).toBeGreaterThan(0.01);
    expect(s.elapsed_s).toBeLessThan(3);
    expect(s.start).toBeGreaterThan(1);
    expect(s.stderr).toEqual(
      "killed command 'sh -c echo foo; sleep 1; echo bar;'",
    );
    expect(s.exit_code).toEqual(1);
  });
});
