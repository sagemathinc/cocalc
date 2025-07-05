/*************************************************************************
 * This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 * License: MS-RSL – see LICENSE.md for details
 *************************************************************************/

// This is a small helper class to record real-time metrics about the hub.
// It is designed for the hub, such that a local process can easily check its health.
// After an initial version, this has been repurposed to use prometheus.
// It wraps its client elements and adds some instrumentation to some hub components.

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { defaults } from "@cocalc/util/misc";
import * as prom_client from "prom-client";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("metrics:metrics-recorder");

// some constants
const FREQ_s = 5; // update stats every FREQ seconds
const DELAY_s = 10; // with an initial delay of DELAY seconds

// collect some recommended default metrics
// @ts-ignore - timeout param is not in the typings
//      https://github.com/siimon/prom-client/blob/4c6421b2253c9780a845889004b9a58dac646a1c/index.d.ts#L770
prom_client.collectDefaultMetrics({ timeout: FREQ_s * 1000 });

// CLK_TCK (usually 100, but maybe not ...)
let CLK_TCK: number | null;
try {
  CLK_TCK = parseInt(execSync("getconf CLK_TCK", { encoding: "utf8" }));
} catch (err) {
  CLK_TCK = null;
}

/**
 * there is more than just continuous values
 * cont: continuous (like number of changefeeds), will be smoothed
 * disc: discrete, like blocked, will be recorded with timestamp
 *       in a queue of length DISC_LEN
 */
export const TYPE = {
  COUNT: "counter", // strictly non-decrasing integer
  GAUGE: "gauge", // only the most recent value is recorded
  LAST: "latest", // only the most recent value is recorded
  DISC: "discrete", // timeseries of length DISC_LEN
  CONT: "continuous", // continuous with exponential decay
  MAX: "contmax", // like CONT, reduces buffer to max value
  SUM: "contsum", // like CONT, reduces buffer to sum of values divided by FREQ_s
} as const;

const PREFIX = "cocalc_hub_";

// --- Prometheus metric helpers ---

export function new_counter(name: string, help: string, labels?: string[]) {
  if (!name.endsWith("_total")) {
    throw new Error(
      `Counter metric names have to end in [_unit]_total but I got '${name}' -- https://prometheus.io/docs/practices/naming/`,
    );
  }
  return new prom_client.Counter({
    name: PREFIX + name,
    help,
    labelNames: labels ?? [],
  });
}

export function new_gauge(name: string, help: string, labels?: string[]) {
  return new prom_client.Gauge({
    name: PREFIX + name,
    help,
    labelNames: labels ?? [],
  });
}

export function new_quantile(
  name: string,
  help: string,
  config: { percentiles?: number[]; labels?: string[] } = {},
) {
  config = defaults(config, {
    // a few more than the default, in particular including the actual min and max
    percentiles: [0.0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1.0],
    labels: [],
  });
  return new prom_client.Summary({
    name: PREFIX + name,
    help,
    labelNames: config.labels,
    percentiles: config.percentiles,
  });
}

export function new_histogram(
  name: string,
  help: string,
  config: { buckets?: number[]; labels?: string[] } = {},
) {
  config = defaults(config, {
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: [],
  });
  return new prom_client.Histogram({
    name: PREFIX + name,
    help,
    labelNames: config.labels,
    buckets: config.buckets,
  });
}

// This is modified by the Client class (in client.coffee) when metrics
// get pushed from browsers.  It's a map from client_id to
// an array of metrics objects, which are already labeled with extra
// information about the client_id and account_id.
export const client_metrics: Record<string, any> = {};

export class MetricsRecorder {
  private _collectors: Array<() => void> = [];

  private _cpu_seconds_total;
  private _collect_duration;
  private _collect_duration_last;

  constructor() {
    this.setup_monitoring();
  }

  async client_metrics(): Promise<string> {
    // exports.client_metrics is a mapping of client id to the json exported metric.
    // The AggregatorRegistry is supposed to work with a list of metrics, and by default,
    // it sums them up. `aggregate` is a static method and hence it should be ok to use it directly.
    const metricsArray = Object.values(client_metrics);
    const registry = prom_client.AggregatorRegistry.aggregate(
      metricsArray as any,
    );
    return await registry.metrics();
  }

  async metrics(): Promise<string> {
    // get a serialized representation of the metrics status
    // (was a dict that should be JSON, now it is for prometheus)
    // it's only called by the HTTP stuff in servers for the /metrics endpoint
    const hub = await prom_client.register.metrics();
    const clients = await this.client_metrics();
    return hub + clients;
  }

  register_collector(collector: () => void): void {
    // The added collector functions will be evaluated periodically to gather metrics
    this._collectors.push(collector);
  }

  setup_monitoring(): void {
    // setup monitoring of some components
    // called by the hub *after* setting up the DB, etc.
    const num_clients_gauge = new_gauge(
      "clients_count",
      "Number of connected clients",
    );
    const { number_of_clients } = require("./hub_register");
    this.register_collector(() => {
      try {
        num_clients_gauge.set(number_of_clients());
      } catch {
        num_clients_gauge.set(0);
      }
    });

    // our own CPU metrics monitor, separating user and sys!
    // it's actually a counter, since it is non-decreasing, but we'll use .set(...)
    this._cpu_seconds_total = new_gauge(
      "process_cpu_categorized_seconds_total",
      "Total number of CPU seconds used",
      ["type"],
    );

    this._collect_duration = new_histogram(
      "metrics_collect_duration_s",
      "How long it took to gather the metrics",
      { buckets: [0.0001, 0.001, 0.01, 1] },
    );
    this._collect_duration_last = new_gauge(
      "metrics_collect_duration_s_last",
      "How long it took the last time to gather the metrics",
    );

    setTimeout(
      () => setInterval(() => this._collect(), FREQ_s * 1000),
      DELAY_s * 1000,
    );
  }

  private _collect(): void {
    // Note: prom-client v14's timers are sync
    const endG = (this._collect_duration_last as any).startTimer();
    const endH = (this._collect_duration as any).startTimer();

    for (const c of this._collectors) {
      c();
    }

    // Linux specific: collecting this process and all its children sys+user times
    // http://man7.org/linux/man-pages/man5/proc.5.html
    fs.readFile(
      path.join("/proc", `${process.pid}`, "stat"),
      "utf8",
      (err, infos) => {
        if (err || CLK_TCK == null) {
          logger.debug(`_collect err: ${err}`);
          return;
        }
        // there might be spaces in the process name, hence split after the closing bracket!
        const proc_end = infos.lastIndexOf(")") + 2;
        const stat_fields = infos.substring(proc_end).split(" ");

        // Indices per /proc/[pid]/stat man page
        this._cpu_seconds_total
          .labels("user")
          .set(parseFloat(stat_fields[11]) / CLK_TCK);
        this._cpu_seconds_total
          .labels("system")
          .set(parseFloat(stat_fields[12]) / CLK_TCK);
        // time spent waiting on child processes
        this._cpu_seconds_total
          .labels("chld_user")
          .set(parseFloat(stat_fields[13]) / CLK_TCK);
        this._cpu_seconds_total
          .labels("chld_system")
          .set(parseFloat(stat_fields[14]) / CLK_TCK);

        // END: the timings for this run.
        endG();
        endH();
      },
    );
  }
}

let metricsRecorder: MetricsRecorder | null = null;

export function init(): MetricsRecorder {
  if (metricsRecorder == null) {
    metricsRecorder = new MetricsRecorder();
  }
  return metricsRecorder;
}

export function get(): MetricsRecorder | null {
  return metricsRecorder;
}
