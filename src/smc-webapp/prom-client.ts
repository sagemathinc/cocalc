/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use prom-client in browser!

NOTE: We explicitly import inside the prom-client package, since the index.js
in that package imports some things that make no sense in a browser.
*/

const PREFIX = "webapp_";

import { COCALC_MINIMAL } from "./fullscreen";
export const enabled = true && !COCALC_MINIMAL;
console.log("initializing prometheus client. enabled =", enabled);

import { webapp_client } from "./webapp-client";

import { globalRegistry } from "prom-client/lib/registry";
import { Counter } from "prom-client/lib/counter";
import { Gauge } from "prom-client/lib/gauge";
import { Histogram } from "prom-client/lib/histogram";
import { Summary } from "prom-client/lib/summary";

// ATTN: default metrics do not work, because they are only added upon "proper" export -- not our .get json trick
// register.setDefaultLabels(defaultLabels)

async function send() {
  if (!webapp_client.is_connected()) {
    //console.log("prom-client.send: not connected")
    return;
  }
  const metrics = await globalRegistry.getMetricsAsJSON();
  return webapp_client.tracking_client.send_metrics(metrics);
}
//console.log('prom-client.send: sending metrics')

let _interval_s: ReturnType<typeof setInterval> | undefined = undefined;

export async function start_metrics(interval_s = 120) {
  //console.log('start_metrics')
  stop_metrics();
  // send once so hub at least knows something about our metrics.
  await send();
  // and then send every interval_s seconds:
  return (_interval_s = setInterval(send, 1000 * interval_s));
}

function stop_metrics() {
  if (_interval_s != null) {
    clearInterval(_interval_s);
    return (_interval_s = undefined);
  }
}

// a prometheus counter -- https://github.com/siimon/prom-client#counter
// usage: counter.labels(labelA, labelB).inc([positive number or default is 1])
export function new_counter(name: string, help: string, labels?: string[]) {
  if (!name.endsWith("_total")) {
    throw `Counter metric names have to end in [_unit]_total but I got '${name}' -- https://prometheus.io/docs/practices/naming/`;
  }
  return new Counter({ name: PREFIX + name, help, labelNames: labels });
}

// a prometheus gauge -- https://github.com/siimon/prom-client#gauge
// usage: gauge.labels(labelA, labelB).set(value)
export function new_gauge(name: string, help: string, labels?: string[]) {
  return new Gauge({ name: PREFIX + name, help, labelNames: labels });
}

interface QuantileConfig {
  percentiles?: number[];
  labels?: string[];
}

// invoked as quantile.observe(value)
export function new_quantile(
  name: string,
  help: string,
  config: QuantileConfig = {}
) {
  config = {
    ...{
      // a few more than the default, in particular including the actual min and max
      percentiles: [0.0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1.0],
      labels: [],
    },
    ...config,
  };
  return new Summary({
    name: PREFIX + name,
    help,
    labelNames: config.labels,
    percentiles: config.percentiles,
  });
}

interface HistogramConfig {
  buckets?: number[];
  labels?: string[];
}

// invoked as histogram.observe(value)
export function new_histogram(
  name: string,
  help: string,
  config: HistogramConfig = {}
) {
  config = {
    ...{
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      labels: [],
    },
    ...config,
  };
  return new Histogram({
    name: PREFIX + name,
    help,
    labelNames: config.labels,
    buckets: config.buckets,
  });
}
