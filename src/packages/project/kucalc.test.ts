import * as kucalc from "./kucalc";

test("compute status is doing something", async () => {
  const status = await kucalc.test_compute_status();
  //console.log(JSON.stringify(status, null, 2))
  expect(new Set(Object.keys(status))).toEqual(
    new Set([
      "cpu",
      "disk_MB",
      "memory",
      "oom_kills",
      "processes",
      "session_id",
      "start_ts",
      "time",
    ])
  );
  expect(status.memory.rss).toBeDefined();
});

test("prometheus metric", async () => {
  await kucalc.test_compute_status();
  const project_id = "d9f0af23-6415-4df8-9888-84dbcaeee7f0";
  const metrics = await kucalc.prometheus_metrics(project_id);
  expect(metrics).toMatch(new RegExp(project_id));
  expect(metrics).toMatch(/cocalc_project_memory_usage_ki/);
  // check last character of metrics is a newline
  expect(metrics[metrics.length - 1]).toBe("\n");
});
