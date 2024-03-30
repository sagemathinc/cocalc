import { Counter, Gauge, Histogram } from "prom-client";

type Aspect = "db" | "database" | "server" | "llm";

function withPrefix(aspect: Aspect, name: string): string {
  return `cocalc_${aspect}_${name}`;
}

const cache: any = {};

export function newCounter(
  aspect: Aspect,
  name: string,
  help: string,
  labelNames: string[] = [],
) {
  name = withPrefix(aspect, name);
  const key = `counter-${name}`;
  if (cache[key] != null) {
    return cache[key];
  }
  // a prometheus counter -- https://github.com/siimon/prom-client#counter
  // use it like counter.labels(labelA, labelB).inc([positive number or default is 1])
  if (!name.endsWith("_total")) {
    throw Error(
      `Counter metric names have to end in [_unit]_total but got '${name}' -- https://prometheus.io/docs/practices/naming/`,
    );
  }
  const C = new Counter({
    name,
    help,
    labelNames,
  });
  cache[key] = C;
  return C;
}

export function newGauge(
  aspect: Aspect,
  name: string,
  help,
  labelNames: string[] = [],
) {
  name = withPrefix(aspect, name);
  const key = `gauge-${name}`;
  if (cache[key] != null) {
    return cache[key];
  }
  const G = new Gauge({
    name,
    help,
    labelNames,
  });
  cache[key] = G;
  return G;
}

export function newHistogram(
  aspect: Aspect,
  name: string,
  help,
  config: { buckets?: number[]; labels?: string[] } = {},
) {
  name = withPrefix(aspect, name);
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
    name,
    help,
    labelNames: config.labels,
    buckets: config.buckets,
  });
  cache[key] = H;
  return H;
}
