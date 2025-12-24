import getLogger from "@cocalc/backend/logger";
import {
  claimCloudVmWork,
  markCloudVmWorkDone,
  markCloudVmWorkFailed,
  type CloudVmWorkRow,
} from "./db";

const logger = getLogger("server:cloud:worker");

export type CloudVmWorkHandler = (row: CloudVmWorkRow) => Promise<void>;

export type CloudVmWorkHandlers = Record<string, CloudVmWorkHandler>;

export async function processCloudVmWorkOnce(opts: {
  worker_id: string;
  limit?: number;
  handlers: CloudVmWorkHandlers;
}) {
  const rows = await claimCloudVmWork({
    worker_id: opts.worker_id,
    limit: opts.limit ?? 5,
  });
  for (const row of rows) {
    const handler = opts.handlers[row.action];
    if (!handler) {
      await markCloudVmWorkFailed(row.id, `no handler for ${row.action}`);
      continue;
    }
    try {
      await handler(row);
      await markCloudVmWorkDone(row.id);
    } catch (err) {
      logger.warn("cloud work failed", { id: row.id, action: row.action, err });
      await markCloudVmWorkFailed(row.id, `${err}`);
    }
  }
  return rows.length;
}

export function startCloudVmWorker(opts: {
  worker_id: string;
  handlers: CloudVmWorkHandlers;
  interval_ms?: number;
  limit?: number;
}) {
  const interval_ms = opts.interval_ms ?? 2000;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await processCloudVmWorkOnce({
        worker_id: opts.worker_id,
        limit: opts.limit ?? 5,
        handlers: opts.handlers,
      });
    } catch (err) {
      logger.warn("cloud worker tick failed", { err });
    }
  };

  // run once immediately, then on interval
  void tick();
  const timer = setInterval(tick, interval_ms);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
