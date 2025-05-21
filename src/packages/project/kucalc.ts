/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Some code specific to running a project in the KuCalc environment.
*/

import { readFile as readFileAsync } from "node:fs/promises";

// Prometheus client setup -- https://github.com/siimon/prom-client
import prom_client from "prom-client";

import { execute_code } from "@cocalc/backend/misc_node";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { startswith } from "@cocalc/util/misc";
import get_bugs_total from "./bug-counter";
import { session_id, start_ts } from "./consts";
import { getLogger } from "./logger";

const L = getLogger("kucalc");

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
export let IN_KUCALC = false;

export function setInKucalc(val: boolean): void {
  IN_KUCALC = val;
}

// status information
let current_status: Partial<Status> = {};

export function init(client) {
  // update project status every 30s
  // TODO: could switch to faster when it's changing and slower when it isn't.
  const f = () => update_project_status(client);
  f();
  return setInterval(f, 30000);
}

async function update_project_status(client) {
  const dbg = client.dbg("update_status");
  dbg();

  try {
    const status = await compute_status();
    current_status = status;
    await cb2(client.query, {
      query: {
        projects: { project_id: client.client_id(), status },
      },
    });
  } catch (err) {
    dbg(`ERROR: ${err}`);
  }
}

export async function test_compute_status() {
  return await compute_status();
}

async function compute_status(): Promise<Status> {
  const status: Status = {
    time: Date.now(),
    memory: { rss: 0 },
    disk_MB: 0,
    cpu: {},
    start_ts,
    session_id,
    processes: {},
    oom_kills: 0,
  };
  await Promise.all([
    compute_status_disk(status),
    cgroup_stats(status),
    processes_info(status),
    compute_status_tmp(status),
  ]);
  return status;
}

async function compute_status_disk(status) {
  const x: number = await disk_usage("$HOME");
  status.disk_MB = x;
}

async function processes_info(status): Promise<void> {
  const cols = ["pid", "lstart", "time", "rss", "args"];

  return new Promise((resolve, _reject) => {
    execute_code({
      command: "ps",
      args: ["--no-header", "-o", cols.join(","), "-u", "user"], // TODO user should be data.username ?
      bash: false,
      cb(err, out) {
        if (err || out?.exit_code !== 0) {
          L.warn(`ps failed: ${err} ${out?.stderr}`);
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
        }
        resolve();
      },
    });
  });
}

// NOTE: we use tmpfs for /tmp, so RAM usage is the **sum** of /tmp and what
// processes use.
async function compute_status_tmp(status) {
  const x: number = await disk_usage("/tmp");
  status.memory.rss += 1000 * x;
}

// this grabs the memory stats directly from the sysfs cgroup files
// the actual usage is the sum of the rss values plus cache, but we leave cache aside
async function cgroup_stats(status) {
  async function getMemory() {
    const data = await readFileAsync(
      "/sys/fs/cgroup/memory/memory.stat",
      "utf8",
    );

    const stats: {
      total_rss?: number;
      total_cache?: number;
      hierarchical_memory_limit?: number;
    } = {};

    for (let line of data.split("\n")) {
      const [key, value] = line.split(" ");
      try {
        stats[key] = parseInt(value);
      } catch (_err) {}
    }
    return stats;
  }

  async function getCPU() {
    const data = await readFileAsync(
      "/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage",
      "utf8",
    );

    try {
      return parseFloat(data) / Math.pow(10, 9);
    } catch (_err) {
      return 0.0;
    }
  }

  async function getOOM() {
    const data = await readFileAsync(
      "/sys/fs/cgroup/memory/memory.oom_control",
      "utf8",
    );

    try {
      for (let line of data.split("\n")) {
        // search string includes a trailing space, otherwise it matches 'oom_kill_disable'!
        if (startswith(line, "oom_kill ")) {
          return parseInt(line.split(" ")[1]);
        }
      }
    } catch (_err) {}
    return 0;
  }

  try {
    const [memory, cpu, oom]: [{ [key: string]: number }, number, number] =
      await Promise.all([getMemory(), getCPU(), getOOM()]);

    const kib = 1024; // convert to kibibyte
    // total_rss includes total_rss_huge
    // Ref: https://www.kernel.org/doc/Documentation/cgroup-v1/memory.txt
    status.memory.rss += (memory.total_rss ?? 0) / kib;
    status.memory.cache = (memory.total_cache ?? 0) / kib;
    status.memory.limit = (memory.hierarchical_memory_limit ?? 0) / kib;
    status.cpu.usage = cpu;
    status.oom_kills = oom;
  } catch (err) {
    L.warn(`cgroup_stats error: ${err}`);
  }
}

async function disk_usage(path): Promise<number> {
  return new Promise((resolve, reject) => {
    execute_code({
      command: `df -BM ${path} | tail -1 | awk '{gsub(\"M\",\"\");print $3}'`,
      bash: true,
      cb(err, out) {
        if (err) {
          return reject(err);
        } else {
          return resolve(parseInt(out?.stdout ?? "0"));
        }
      },
    });
  });
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
      `# TYPE ${P}_oom_kills_total counter`,
      `${P}_oom_kills_total{${labels}} ${cs.oom_kills ?? 0}`,
    ].join("\n") + "\n" // makes sure the response ends with a newline!
  );
}

// called inside raw_server
export function init_health_metrics(raw_server, project_id): void {
  if (!IN_KUCALC) {
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
    const part1 = prometheus_metrics(project_id);
    res.send(part1 + "\n" + (await prom_client.register.metrics()) + "\n");
  });
}
