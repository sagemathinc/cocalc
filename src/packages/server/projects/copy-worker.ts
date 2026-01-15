import { randomUUID } from "node:crypto";
import getLogger from "@cocalc/backend/logger";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import {
  claimLroOps,
  getLro,
  touchLro,
  updateLro,
} from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/server/lro/stream";
import { COPY_CANCELED_CODE, copyProjectFiles } from "./copy";
import { listCopiesByOpId } from "./copy-db";

const logger = getLogger("server:projects:copy-worker");

const COPY_LRO_KIND = "copy-path-between-projects";
const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 2;

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  validate: 5,
  backup: 40,
  queue: 70,
  "copy-local": 90,
  done: 100,
};

let running = false;
let inFlight = 0;

function publishSummary(summary: LroSummary) {
  return publishLroSummary({
    scope_type: summary.scope_type,
    scope_id: summary.scope_id,
    summary,
  });
}

function progressEvent({
  op,
  step,
  message,
  detail,
}: {
  op: LroSummary;
  step: string;
  message?: string;
  detail?: any;
}) {
  void publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: step,
      message,
      progress: progressSteps[step],
      detail,
    },
  });
}

async function handleCopyOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const src = input.src;
  const dests = Array.isArray(input.dests)
    ? input.dests
    : input.dest
      ? [input.dest]
      : [];
  const options = input.options;
  const account_id = op.created_by ?? input.account_id;

  if (!account_id || !src || !dests.length) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "copy op missing src/dest or account",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  logger.info("copy op start", {
    op_id,
    src_project_id: src.project_id,
    dests: dests.length,
  });

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("copy op heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const progress = (update: {
    step: string;
    message?: string;
    detail?: any;
  }) => {
    logger.info("copy op step", {
      op_id,
      step: update.step,
      message: update.message,
      detail: update.detail,
    });
    progressEvent({ op, ...update });
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      () => {},
    );
  };

  let canceled = false;
  const shouldAbort = async () => {
    if (canceled) return true;
    const current = await getLro(op_id);
    if (current?.status === "canceled" || current?.status === "expired") {
      canceled = true;
      return true;
    }
    return false;
  };

  try {
    const existing = await listCopiesByOpId({ op_id });
    const existingSnapshot = existing[0]?.snapshot_id;
    const storedSnapshot = (op.result ?? {}).snapshot_id;
    const snapshot_id = storedSnapshot ?? existingSnapshot;
    const queue_mode = existing.length ? "insert" : "upsert";

    const result = await copyProjectFiles({
      src,
      dests,
      options,
      account_id,
      op_id,
      progress,
      snapshot_id,
      queue_mode,
      shouldAbort,
    });

    if (result.snapshot_id && !storedSnapshot) {
      const updated = await updateLro({
        op_id,
        result: { ...(op.result ?? {}), snapshot_id: result.snapshot_id },
      });
      if (updated) {
        await publishSummary(updated);
      }
    }

    const hasRemote = result.queued > 0 || existing.length > 0;
    if (hasRemote) {
      const updated = await updateLro({
        op_id,
        status: "running",
        progress_summary:
          result.queued > 0
            ? {
                phase: "queued",
                queued: result.queued,
                local: result.local,
                total: result.queued + result.local,
                snapshot_id: result.snapshot_id,
              }
            : undefined,
        error: null,
      });
      if (updated) {
        await publishSummary(updated);
      }
    } else {
      const progress_summary = {
        done: result.local,
        total: result.local,
        failed: 0,
        queued: 0,
        expired: 0,
        applying: 0,
        canceled: 0,
      };
      const updated = await updateLro({
        op_id,
        status: "succeeded",
        progress_summary,
        result: progress_summary,
        error: null,
      });
      if (updated) {
        await publishSummary(updated);
      }
    }

  } catch (err) {
    const isCanceled = (err as any)?.code === COPY_CANCELED_CODE;
    if (isCanceled) {
      const updated = await updateLro({
        op_id,
        status: "canceled",
        error: "canceled",
      });
      if (updated) {
        await publishSummary(updated);
      }
      progress({ step: "done", message: "canceled" });
      return;
    }
    logger.warn("copy op failed", { op_id, err: `${err}` });
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `${err}`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    progress({ step: "done", message: "failed" });
  } finally {
    clearInterval(heartbeat);
    logger.info("copy op done", { op_id });
  }
}

export function startCopyLroWorker({
  intervalMs = TICK_MS,
  maxParallel = MAX_PARALLEL,
} = {}) {
  if (running) return () => undefined;
  running = true;
  logger.info("starting copy LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    const limit = Math.max(1, maxParallel - inFlight);
    let ops: LroSummary[] = [];
    try {
      ops = await claimLroOps({
        kind: COPY_LRO_KIND,
        owner_type: OWNER_TYPE,
        owner_id: WORKER_ID,
        limit,
        lease_ms: LEASE_MS,
      });
    } catch (err) {
      logger.warn("copy worker claim failed", { err });
      return;
    }
    if (!ops.length) return;

    for (const op of ops) {
      inFlight += 1;
      void publishSummary(op).catch(() => {});
      void handleCopyOp(op)
        .catch((err) =>
          logger.warn("copy op crashed", { op_id: op.op_id, err }),
        )
        .finally(() => {
          inFlight -= 1;
        });
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  void tick();

  return () => clearInterval(timer);
}
