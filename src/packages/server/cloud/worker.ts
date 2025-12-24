// Cloud VM work queue worker. This runs tasks concurrently while keeping a
// steady pipeline of work: claim a batch, execute up to a configurable
// concurrency cap, and as each job completes, claim another. Multiple worker
// processes can run in parallel; Postgres `FOR UPDATE SKIP LOCKED` ensures
// each job is claimed by at most one worker.

import getLogger from "@cocalc/backend/logger";
import {
  claimCloudVmWork,
  markCloudVmWorkDone,
  markCloudVmWorkFailed,
  type CloudVmWorkRow,
} from "./db";
import { logCloudVmEvent } from "./db";

const logger = getLogger("server:cloud:worker");

const DEFAULT_MAX_CONCURRENCY = 10;
const DEFAULT_PER_PROVIDER = 10;

export type CloudVmWorkHandler = (row: CloudVmWorkRow) => Promise<void>;

export type CloudVmWorkHandlers = Record<string, CloudVmWorkHandler>;

export async function processCloudVmWorkOnce(opts: {
  worker_id: string;
  limit?: number;
  handlers: CloudVmWorkHandlers;
  max_concurrency?: number;
  max_per_provider?: number;
}) {
  const maxConcurrency = opts.max_concurrency ?? DEFAULT_MAX_CONCURRENCY;
  const maxPerProvider = opts.max_per_provider ?? DEFAULT_PER_PROVIDER;
  let processed = 0;

  const pending: CloudVmWorkRow[] = [];
  const inFlight = new Set<Promise<void>>();
  const providerCounts = new Map<string, number>();

  const runRow = async (row: CloudVmWorkRow) => {
    const handler = opts.handlers[row.action];
    if (!handler) {
      await markCloudVmWorkFailed(row.id, `no handler for ${row.action}`);
      return;
    }
    try {
      await handler(row);
      await markCloudVmWorkDone(row.id);
    } catch (err) {
      logger.warn("cloud work failed", { id: row.id, action: row.action, err });
      await markCloudVmWorkFailed(row.id, `${err}`);
      try {
        await logCloudVmEvent({
          vm_id: row.vm_id,
          action: row.action,
          status: "failure",
          provider: row.payload?.provider as string | undefined,
          error: `${err}`,
        });
      } catch (logErr) {
        logger.warn("cloud work failed: logging failure event failed", {
          id: row.id,
          action: row.action,
          err: logErr,
        });
      }
    }
  };

  const claimMore = async (count: number) => {
    if (count <= 0) return 0;
    const rows = await claimCloudVmWork({
      worker_id: opts.worker_id,
      limit: count,
    });
    if (rows.length) {
      pending.push(...rows);
      processed += rows.length;
    }
    return rows.length;
  };

  const schedule = () => {
    let scheduled = false;
    while (inFlight.size < maxConcurrency && pending.length) {
      const idx = pending.findIndex((row) => {
        const provider = (row.payload?.provider as string) ?? "default";
        return (providerCounts.get(provider) ?? 0) < maxPerProvider;
      });
      if (idx === -1) break;
      const row = pending.splice(idx, 1)[0];
      const provider = (row.payload?.provider as string) ?? "default";
      providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
      const task = runRow(row).finally(() => {
        providerCounts.set(
          provider,
          Math.max(0, (providerCounts.get(provider) ?? 1) - 1),
        );
        inFlight.delete(task);
      });
      inFlight.add(task);
      scheduled = true;
    }
    return scheduled;
  };

  await claimMore(opts.limit ?? maxConcurrency);
  schedule();

  while (inFlight.size || pending.length) {
    if (inFlight.size === 0) {
      const claimed = await claimMore(maxConcurrency);
      schedule();
      if (claimed === 0 && inFlight.size === 0 && pending.length === 0) {
        break;
      }
      continue;
    }
    await Promise.race(inFlight);
    schedule();
    if (inFlight.size < maxConcurrency && pending.length === 0) {
      await claimMore(maxConcurrency - inFlight.size);
      schedule();
    }
  }

  return processed;
}

export function startCloudVmWorker(opts: {
  worker_id: string;
  handlers: CloudVmWorkHandlers;
  interval_ms?: number;
  limit?: number;
  max_concurrency?: number;
  max_per_provider?: number;
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
        max_concurrency: opts.max_concurrency ?? DEFAULT_MAX_CONCURRENCY,
        max_per_provider: opts.max_per_provider ?? DEFAULT_PER_PROVIDER,
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
