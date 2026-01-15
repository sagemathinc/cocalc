import { randomUUID } from "node:crypto";
import getLogger from "@cocalc/backend/logger";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import {
  claimLroOps,
  touchLro,
  updateLro,
} from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/server/lro/stream";
import { moveProjectToHost, type MoveProjectProgressUpdate } from "./move";

const logger = getLogger("server:projects:move-worker");

const MOVE_LRO_KIND = "project-move";
const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 1;

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  validate: 5,
  "stop-source": 15,
  backup: 55,
  placement: 70,
  "start-dest": 85,
  cleanup: 95,
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
  update,
}: {
  op: LroSummary;
  update: MoveProjectProgressUpdate;
}) {
  const progress =
    progressSteps[update.step] != null ? progressSteps[update.step] : undefined;
  void publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: update.step,
      message: update.message,
      progress,
      detail: update.detail,
    },
  });
}

async function updateProgressSummary(op: LroSummary, update: MoveProjectProgressUpdate) {
  const updated = await updateLro({
    op_id: op.op_id,
    progress_summary: {
      phase: update.step,
      ...(update.detail ?? {}),
    },
  });
  if (updated) {
    await publishSummary(updated);
  }
}

async function handleMoveOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const project_id = input.project_id;
  const dest_host_id = input.dest_host_id;
  const account_id = op.created_by ?? input.account_id;

  if (!project_id || !account_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "move op missing project_id or account",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  logger.info("move op start", {
    op_id,
    project_id,
    dest_host_id,
  });

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("move op heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const progress = async (update: MoveProjectProgressUpdate) => {
    logger.info("move op step", {
      op_id,
      step: update.step,
      message: update.message,
      detail: update.detail,
    });
    progressEvent({ op, update });
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      () => {},
    );
    await updateProgressSummary(op, update).catch(() => {});
  };

  try {
    await progress({
      step: "validate",
      message: "starting move",
      detail: { dest_host_id },
    });
    await moveProjectToHost(
      {
        project_id,
        dest_host_id,
        account_id,
      },
      { progress },
    );

    const updated = await updateLro({
      op_id,
      status: "succeeded",
      progress_summary: { phase: "done" },
      result: { project_id, dest_host_id },
      error: null,
    });
    if (updated) {
      await publishSummary(updated);
    }
  } catch (err) {
    logger.warn("move op failed", { op_id, err: `${err}` });
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `${err}`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    await progress({ step: "done", message: "failed", detail: { error: `${err}` } });
  } finally {
    clearInterval(heartbeat);
    logger.info("move op done", { op_id });
  }
}

export function startMoveLroWorker({
  intervalMs = TICK_MS,
  maxParallel = MAX_PARALLEL,
} = {}) {
  if (running) return () => undefined;
  running = true;
  logger.info("starting move LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    let ops: LroSummary[] = [];
    try {
      ops = await claimLroOps({
        kind: MOVE_LRO_KIND,
        owner_type: OWNER_TYPE,
        owner_id: WORKER_ID,
        limit: Math.max(1, maxParallel - inFlight),
        lease_ms: LEASE_MS,
      });
    } catch (err) {
      logger.warn("move op claim failed", { err });
      return;
    }

    for (const op of ops) {
      inFlight += 1;
      void handleMoveOp(op)
        .catch(async (err) => {
          logger.warn("move op handler failed", { op_id: op.op_id, err });
          const updated = await updateLro({
            op_id: op.op_id,
            status: "failed",
            error: `${err}`,
          });
          if (updated) {
            await publishSummary(updated);
          }
        })
        .finally(() => {
          inFlight = Math.max(0, inFlight - 1);
        });
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();

  void tick();

  return () => {
    running = false;
    clearInterval(timer);
  };
}
