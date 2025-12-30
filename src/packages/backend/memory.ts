import { getLogger } from "./logger";

const logger = getLogger("backend:memory");

export function enableMemoryUseLogger({
  interval = 10_000,
}: { interval?: number } = {}) {
  logger.debug("enableMemoryUseLogger");
  logMemoryUsage();
  setInterval(logMemoryUsage, interval);
}

export function logMemoryUsage() {
  const v = process.memoryUsage();
  for (const k in v) {
    v[k] = Math.round(v[k] / 1e6);
  }
  logger.debug(JSON.stringify(v));
}
