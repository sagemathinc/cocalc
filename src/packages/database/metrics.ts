import { Counter, Gauge, Histogram } from "prom-client";

const PREFIX = "cocalc_database_";

const cache: any = {};

export function newCounter(name: string, help, labelNames: string[] = []) {
  const key = `counter-${name}`;
  if (cache[key] != null) {
    return cache[key];
  }
  // a prometheus counter -- https://github.com/siimon/prom-client#counter
  // use it like counter.labels(labelA, labelB).inc([positive number or default is 1])
  if (!name.endsWith("_total")) {
    throw Error(
      `Counter metric names have to end in [_unit]_total but got '${name}' -- https://prometheus.io/docs/practices/naming/`
    );
  }
  const C = new Counter({
    name: PREFIX + name,
    help,
    labelNames,
  });
  cache[key] = C;
  return C;
}

export function newGauge(name: string, help, labelNames: string[] = []) {
  const key = `gauge-${name}`;
  if (cache[key] != null) {
    return cache[key];
  }
  const G = new Gauge({
    name: PREFIX + name,
    help,
    labelNames,
  });
  cache[key] = G;
  return G;
}

export function newHistogram(
  name: string,
  help,
  config: { buckets?: number[]; labels?: string[] } = {}
) {
  const key = `hist-${name}`;
  if (cache[key] != null) {
    return cache[key];
  }
  // invoked as histogram.observe(value)
  if (!config.buckets) {
    config.buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }
  if (!config.labels) {
    config.labels = [];
  }
  const H = new Histogram({
    name: PREFIX + name,
    help,
    labelNames: config.labels,
    buckets: config.buckets,
  });
  cache[key] = H;
  return H;
}
