process.env.COCALC_PROJECT_MONITOR_INTERVAL_S = "1";

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

describe("test longer execution", () => {
  it(
    "runs 5 seconds",
    async () => {
      const t0 = Date.now();
      const { stdout, stderr, exit_code } = await executeCode({
        command: "sh",
        args: ["-c", "echo foo; sleep 5; echo bar"],
        err_on_exit: false,
        bash: false,
      });
      expect(stdout).toBe("foo\nbar\n");
      expect(stderr).toBe("");
      expect(exit_code).toBe(0);
      const t1 = Date.now();
      expect((t1 - t0) / 1000).toBeGreaterThan(4.9);
    },
    10 * 1000,
  );
});

describe("test env", () => {
  it("allows to specify environment variables", async () => {
    const { stdout, stderr, type } = await executeCode({
      command: "sh",
      args: ["-c", "echo $FOO;"],
      err_on_exit: false,
      bash: false,
      env: { FOO: "bar" },
    });
    expect(type).toBe("blocking");
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
      expect(s.start).toBeGreaterThan(Date.now() - 10 * 1000);
      expect(s.stderr).toEqual("");
      expect(s.exit_code).toEqual(0);
    }
  });

  it("error/err_on_exit=true", async () => {
    const c = await executeCode({
      command: ">&2 echo baz; exit 3",
      bash: true,
      async_call: true,
      err_on_exit: true, // default
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

  // without err_on_exit, the call is "completed" and we get the correct exit code
  it("error/err_on_exit=false", async () => {
    const c = await executeCode({
      command: ">&2 echo baz; exit 3",
      bash: true,
      async_call: true,
      err_on_exit: false,
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
    expect(s.status).toEqual("completed");
    expect(s.stdout).toEqual("");
    expect(s.stderr).toEqual("baz\n");
    expect(s.exit_code).toEqual(3);
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
    // now we check up on the job
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

  it(
    "long running async job",
    async () => {
      const c = await executeCode({
        command: "sh",
        args: ["-c", `echo foo; python3 -c '${CPU_PY}'; echo bar;`],
        bash: false,
        err_on_exit: false,
        async_call: true,
      });
      expect(c.type).toEqual("async");
      if (c.type !== "async") return;
      const { status, job_id } = c;
      expect(status).toEqual("running");
      expect(typeof job_id).toEqual("string");
      if (typeof job_id !== "string") return;
      await new Promise((done) => setTimeout(done, 5500));
      // now we check up on the job
      const s = await executeCode({ async_get: job_id });
      expect(s.type).toEqual("async");
      if (s.type !== "async") return;
      expect(s.elapsed_s).toBeGreaterThan(5);
      expect(s.exit_code).toBe(0);
      expect(s.pid).toBeGreaterThan(1);
      expect(s.stats).toBeDefined();
      if (!Array.isArray(s.stats)) return;
      const last_stat = s.stats[s.stats.length - 2];
      expect(last_stat.cpu_pct).toBeGreaterThan(10);
      expect(last_stat.cpu_secs).toBeGreaterThan(1);
      expect(last_stat.mem_rss).toBeGreaterThan(1);
      expect(s.stdout).toEqual("foo\nbar\n");
    },
    10 * 1000,
  );
});

// we burn a bit of CPU to get the cpu_pct and cpu_secs up
const CPU_PY = `
from time import time
t0=time()
while t0+5>time():
  sum([_ for _ in range(10**6)])
`;
