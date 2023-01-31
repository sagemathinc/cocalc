/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some code specific to running a project in the KuCalc environment.
*/

import { execute_code } from "@cocalc/backend/execute-code";
import * as async from "async";
import { readFile } from "node:fs";

import { startswith } from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/callback";
import get_bugs_total from "./bug-counter";
import { session_id, start_ts } from "./consts";
const misc_node = require("@cocalc/backend/misc_node");

interface Status {
  time: number;
  memory: { limit?: number; rss?: number };
  cpu: { usage?: number };
  disk_MB: number;
  start_ts: number;
  session_id: string;
  processes: { [key: string]: { cpu: number; memory: number } };
  oom_kills: number;
}

// Prometheus client setup -- https://github.com/siimon/prom-client
import prom_client from "prom-client";

// additionally, record GC statistics
// https://www.npmjs.com/package/prometheus-gc-stats
//# I'm commenting this out because the package prometheus-gc-stats
//# on npm very explicitly says it does not support prom-client
//# version 13, which is what we have installed everywhere.  That
//# version is a significant breaking change from version 12, so
//# I'm also not comfortable reverting back.  Harald I think force
//# upgraded prom-client to version 13 in this commit: b31e087ea2c640f494db15b652d9d0f86e7bd8a5
// require('prometheus-gc-stats')()()

// collect some recommended default metrics
prom_client.collectDefaultMetrics();

// --- end prometheus setup

// This gets **changed** to true, if a certain
// command line flag is passed in.
exports.IN_KUCALC = false;

// status information
let current_status: Partial<Status> = {};

export function init(client) {
  // update project status every 30s
  // TODO: could switch to faster when it's changing and slower when it isn't.
  const f = () => update_project_status(client);
  f();
  return setInterval(f, 30000);
}

function update_project_status(client, cb?: CB<void>) {
  const dbg = client.dbg("update_status");
  dbg();
  let status = undefined;
  return async.series(
    [
      (cb) =>
        compute_status(function (err, s) {
          status = s;
          if (!err) {
            current_status = s;
          }
          return cb(err);
        }),
      (cb) =>
        client.query({
          query: {
            projects: { project_id: client.client_id(), status },
          },
          cb,
        }),
    ],
    (err) => cb?.(err)
  );
}

export function compute_status(cb) {
  const status: Status = {
    time: new Date().getTime(),
    memory: { rss: 0 },
    disk_MB: 0,
    cpu: {},
    start_ts,
    session_id,
    processes: {},
    oom_kills: 0,
  };
  async.parallel(
    [
      (cb) => compute_status_disk(status, cb),
      (cb) => cgroup_stats(status, cb),
      (cb) => processes_info(status, cb),
      (cb) => compute_status_tmp(status, cb),
    ],
    (err) => cb(err, status)
  );
}

function compute_status_disk(status, cb) {
  disk_usage("$HOME", function (err, x) {
    status.disk_MB = x;
    cb(err);
  });
}

function processes_info(status, cb) {
  const cols = ["pid", "lstart", "time", "rss", "args"];
  return misc_node.execute_code({
    command: "ps",
    args: ["--no-header", "-o", cols.join(","), "-u", "user"],
    bash: false,
    cb(err, out) {
      if (err || out.exit_code !== 0) {
        return cb(err);
      } else {
        let cnt = -1; // no need to account for the ps process itself!
        // TODO parsing anything out of ps is really hard :-(
        // but we want to know how many sage, jupyter, console, etc. instances are running.
        for (let line of out.stdout.split("\n")) {
          if (line.length > 0) {
            cnt += 1;
          }
        }
        status.processes.count = cnt;
        return cb();
      }
    },
  });
}

// NOTE: we use tmpfs for /tmp, so RAM usage is the **sum** of /tmp and what
// processes use.
function compute_status_tmp(status, cb) {
  disk_usage("/tmp", function (err, x) {
    status.memory.rss += 1000 * x;
    return cb(err);
  });
}

// this grabs the memory stats directly from the sysfs cgroup files
// the actual usage is the sum of the rss values plus cache, but we leave cache aside
function cgroup_stats(status, cb) {
  async.parallel(
    {
      memory(cb) {
        return readFile(
          "/sys/fs/cgroup/memory/memory.stat",
          "utf8",
          function (err, data) {
            if (err) {
              cb(err);
              return;
            }
            const stats = {};
            for (let line of data.split("\n")) {
              const [key, value] = line.split(" ");
              try {
                stats[key] = parseInt(value);
              } catch (error) {}
            }
            return cb(null, stats);
          }
        );
      },

      cpu(cb) {
        return readFile(
          "/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage",
          "utf8",
          function (err, data) {
            if (err) {
              cb(err);
              return;
            }
            try {
              return cb(null, parseFloat(data) / Math.pow(10, 9));
            } catch (error) {
              return cb(null, 0.0);
            }
          }
        );
      },

      oom(cb) {
        return readFile(
          "/sys/fs/cgroup/memory/memory.oom_control",
          "utf8",
          function (err, data) {
            if (err) {
              cb(err);
              return;
            }
            try {
              for (let line of data.split("\n")) {
                // search string includes a trailing space, otherwise it matches 'oom_kill_disable'!
                if (startswith(line, "oom_kill ")) {
                  cb(null, parseInt(line.split(" ")[1]));
                  return;
                }
              }
            } catch (error) {}
            return cb(null, 0);
          }
        );
      },
    },
    function (err, res) {
      if (err) {
        return cb(err);
      }
      const kib = 1024; // convert to kibibyte
      // total_rss includes total_rss_huge
      // Ref: https://www.kernel.org/doc/Documentation/cgroup-v1/memory.txt
      status.memory.rss += (res.memory.total_rss ?? 0) / kib;
      status.memory.cache = (res.memory.total_cache ?? 0) / kib;
      status.memory.limit = (res.memory.hierarchical_memory_limit ?? 0) / kib;
      status.cpu.usage = res.cpu;
      status.oom_kills = res.oom;
      cb();
    }
  );
}

function disk_usage(path, cb) {
  execute_code({
    command: `df -BM ${path} | tail -1 | awk '{gsub(\"M\",\"\");print $3}'`,
    bash: true,
    cb(err, out) {
      if (err) {
        return cb(err);
      } else {
        return cb(undefined, parseInt(out?.stdout ?? "0"));
      }
    },
  });
}

// Every 60s, check if we can reach google's internal network -- in kucalc on GCE, this must be blocked.
// If we receive some information, exit with status code 99.
export function init_gce_firewall_test(logger, interval_ms = 60 * 1000) {
  if (1 == 1) return; // temporarily disabled
  if (!exports.IN_KUCALC) {
    logger?.warn("not running firewall test -- not in kucalc");
    return;
  }
  const URI = "http://metadata.google.internal/computeMetadata/v1/";
  const test_firewall = function () {
    logger?.log("test_firewall");
    const request = require("request");
    return request(
      {
        timeout: 3000,
        headers: {
          "Metadata-Flavor": "Google",
        },
        uri: URI,
        method: "GET",
      },
      function (err, res, body) {
        if (err?.code === "ETIMEDOUT") {
          return logger?.log("test_firewall: timeout -> no action");
        } else {
          logger?.warn("test_firewall", res);
          logger?.warn("test_firewall", body);
          if (res != null || body != null) {
            logger?.warn(
              "test_firewall: request went through and got a response -> exiting with code 99"
            );
            return process.exit(99);
          } else {
            return logger?.warn(
              "test_firewall: request went through with no response -> no action"
            );
          }
        }
      }
    );
  };
  test_firewall();
  setInterval(test_firewall, interval_ms);
}

export function prometheus_metrics(project_id): string {
  const P = "cocalc_project";
  const cs = current_status;
  const labels = `project_id=\"${project_id}\",session_id=\"${session_id}\"`;
  return (
    [
      `# HELP ${P}_bugs_total The total number of caught bugs.`,
      `# TYPE ${P}_bugs_total counter`,
      `${P}_bugs_total{${labels}} ${get_bugs_total()}`,
      `# HELP ${P}_start_time when the project/session started`,
      `# TYPE ${P}_start_time counter`,
      `${P}_start_time{${labels}} ${start_ts}`,
      `# HELP ${P}_cpu_usage_seconds`,
      `# TYPE ${P}_cpu_usage_seconds counter`,
      `${P}_cpu_usage_seconds{${labels}} ${cs.cpu?.usage ?? 0.0}`,
      `# HELP ${P}_disk_usage_mb`,
      `# TYPE ${P}_disk_usage_mb gauge`,
      `${P}_disk_usage_mb{${labels}} ${cs.disk_MB ?? 0.0}`,
      `# HELP ${P}_memory_usage_ki`,
      `# TYPE ${P}_memory_usage_ki gauge`,
      `${P}_memory_usage_ki{${labels}} ${cs.memory?.rss ?? 0.0}`,
      `# HELP ${P}_memory_limit_ki`,
      `# TYPE ${P}_memory_limit_ki gauge`,
      `${P}_memory_limit_ki{${labels}} ${cs.memory?.limit ?? 0.0}`,
      `# HELP ${P}_running_processes_total`,
      `# TYPE ${P}_running_processes_total gauge`,
      `${P}_running_processes_total{${labels}} ${cs.processes?.count ?? 0}`,
      `# HELP ${P}_oom_kills_total`,
      `# TYPE ${P}_oom_kills_total counter `,
      `${P}_oom_kills_total{${labels}} ${cs.oom_kills ?? 0}`,
    ].join("\n") + "\n" // makes sure the response ends with a newline!
  );
}

// called inside raw_server
export function init_health_metrics(raw_server, project_id): void {
  if (!exports.IN_KUCALC) {
    return;
  }
  // Setup health and metrics (no url base prefix needed)
  raw_server.use("/health", function (_req, res): void {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send("OK");
  });

  // prometheus text format -- https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
  raw_server.use("/metrics", async function (_req, res): Promise<void> {
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.header("Cache-Control", "no-cache, no-store");
    const part1 = exports.prometheus_metrics(project_id);
    res.send(part1 + "\n" + (await prom_client.register.metrics()) + "\n");
  });
}
