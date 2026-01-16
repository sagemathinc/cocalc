import { randomUUID } from "node:crypto";
import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import { type Fileserver } from "@cocalc/conat/files/file-server";
import {
  claimLroOps,
  touchLro,
  updateLro,
} from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";

const logger = getLogger("server:projects:restore-worker");

const RESTORE_LRO_KIND = "project-restore";
const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 1;
const RESTORE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  validate: 5,
  restore: 80,
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

function fileServerClientWithTimeout(project_id: string): Fileserver {
  return conat().call<Fileserver>(`file-server.${project_id}`, {
    timeout: RESTORE_TIMEOUT_MS,
  });
}

async function handleRestoreOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const project_id = input.project_id;
  const backup_id = input.id;
  const path = input.path;
  const dest = input.dest;

  if (!project_id || !backup_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "restore op missing project_id or backup id",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  logger.info("restore op start", { op_id, project_id, backup_id });

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("restore op heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let lastProgressKey: string | null = null;
  const progress = (update: {
    step: string;
    message?: string;
    detail?: any;
  }) => {
    let detailKey = "";
    if (update.detail !== undefined) {
      try {
        detailKey = JSON.stringify(update.detail);
      } catch {
        detailKey = String(update.detail);
      }
    }
    const progressKey = `${update.step}|${update.message ?? ""}|${detailKey}`;
    if (progressKey === lastProgressKey) {
      return;
    }
    lastProgressKey = progressKey;
    logger.info("restore op step", {
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

  try {
    const running = await updateLro({
      op_id,
      status: "running",
      error: null,
      progress_summary: { phase: "validate" },
    });
    if (running) {
      await publishSummary(running);
    }
    progress({
      step: "validate",
      message: "starting restore",
      detail: { project_id, backup_id },
    });

    const started = Date.now();
    progress({
      step: "restore",
      message: "restoring backup",
      detail: { backup_id, path, dest },
    });

    const client = fileServerClientWithTimeout(project_id);
    await client.restoreBackup({
      project_id,
      id: backup_id,
      path,
      dest,
      lro: { op_id, scope_type: op.scope_type, scope_id: op.scope_id },
    });
    const duration_ms = Date.now() - started;

    logger.info("restore op done", {
      op_id,
      project_id,
      backup_id,
      duration_ms,
    });

    const updated = await updateLro({
      op_id,
      status: "succeeded",
      result: { id: backup_id, path, dest, duration_ms },
      progress_summary: {
        phase: "done",
        id: backup_id,
        path,
        dest,
        duration_ms,
      },
      error: null,
    });
    if (updated) {
      await publishSummary(updated);
    }
    progress({
      step: "done",
      message: "restore complete",
      detail: { backup_id, path, dest, duration_ms },
    });
  } catch (err) {
    logger.warn("restore op failed", { op_id, err: `${err}` });
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
    logger.info("restore op cleanup", { op_id });
  }
}

export function startRestoreLroWorker({
  intervalMs = TICK_MS,
  maxParallel = MAX_PARALLEL,
} = {}) {
  if (running) return () => undefined;
  running = true;
  logger.info("starting restore LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    let ops: LroSummary[] = [];
    try {
      ops = await claimLroOps({
        kind: RESTORE_LRO_KIND,
        owner_type: OWNER_TYPE,
        owner_id: WORKER_ID,
        limit: Math.max(1, maxParallel - inFlight),
        lease_ms: LEASE_MS,
      });
    } catch (err) {
      logger.warn("restore op claim failed", { err });
      return;
    }

    for (const op of ops) {
      inFlight += 1;
      void handleRestoreOp(op)
        .catch(async (err) => {
          logger.warn("restore op handler failed", { op_id: op.op_id, err });
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
