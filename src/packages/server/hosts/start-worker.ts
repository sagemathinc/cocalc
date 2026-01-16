import { randomUUID } from "node:crypto";
import { delay } from "awaiting";
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import {
  claimLroOps,
  touchLro,
  updateLro,
} from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { startHostInternal } from "@cocalc/server/conat/api/hosts";

const logger = getLogger("server:hosts:start-worker");

const HOST_START_LRO_KIND = "host-start";
const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 2;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 5_000;

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  validate: 5,
  start: 35,
  waiting: 75,
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
  message: string;
  detail?: any;
}) {
  const progress =
    progressSteps[step] != null ? progressSteps[step] : undefined;
  void publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: step,
      message,
      progress,
      detail,
    },
  });
}

async function updateProgressSummary(
  op: LroSummary,
  update: { step: string; detail?: any },
) {
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

async function loadHostStatus(id: string) {
  const { rows } = await getPool().query(
    "SELECT id, status, metadata, deleted FROM project_hosts WHERE id=$1",
    [id],
  );
  return rows[0];
}

async function waitForHostStart({
  host_id,
  onUpdate,
}: {
  host_id: string;
  onUpdate: (status: string, metadata?: any) => Promise<void>;
}) {
  const startedAt = Date.now();
  let lastStatus = "";
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const row = await loadHostStatus(host_id);
    if (!row || row.deleted) {
      throw new Error("host not found");
    }
    const status = String(row.status ?? "");
    if (status && status !== lastStatus) {
      lastStatus = status;
      await onUpdate(status, row.metadata ?? {});
    }
    if (status === "running") {
      return { status, metadata: row.metadata ?? {} };
    }
    if (["error", "off", "deprovisioned"].includes(status)) {
      const lastError = row.metadata?.last_error;
      throw new Error(lastError ? `host ${status}: ${lastError}` : `host ${status}`);
    }
    await delay(POLL_MS);
  }
  throw new Error("timeout waiting for host to start");
}

async function handleOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const host_id = op.scope_id ?? input.id;
  const account_id = op.created_by ?? input.account_id;

  if (!host_id || !account_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "host-start op missing host or account",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("host-start heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let lastStep: string | null = null;
  const progressStep = async (step: string, message: string, detail?: any) => {
    if (step === lastStep) {
      return;
    }
    lastStep = step;
    logger.info("host-start step", { op_id, step, message, detail });
    progressEvent({ op, step, message, detail });
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      () => {},
    );
    await updateProgressSummary(op, { step, detail }).catch(() => {});
  };

  try {
    await progressStep("validate", "starting host", { host_id });
    const running = await updateLro({
      op_id,
      status: "running",
      error: null,
    });
    if (running) {
      await publishSummary(running);
    }

    await progressStep("start", "enqueueing start", { host_id });
    await startHostInternal({ account_id, id: host_id });

    await progressStep("waiting", "waiting for host to be running", { host_id });
    const final = await waitForHostStart({
      host_id,
      onUpdate: async (status, metadata) => {
        logger.debug("host-start status update", {
          op_id,
          host_id,
          status,
          last_action_status: metadata?.last_action_status,
        });
      },
    });

    const updated = await updateLro({
      op_id,
      status: "succeeded",
      progress_summary: {
        phase: "done",
        host_id,
        status: final.status,
      },
      result: { host_id, status: final.status },
      error: null,
    });
    if (updated) {
      await publishSummary(updated);
    }
    await progressStep("done", "host running", { host_id });
  } catch (err) {
    logger.warn("host-start failed", { op_id, err: `${err}` });
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `${err}`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    await progressStep("done", "start failed", { host_id, error: `${err}` });
  } finally {
    clearInterval(heartbeat);
  }
}

export function startHostLroWorker({
  intervalMs = TICK_MS,
  maxParallel = MAX_PARALLEL,
} = {}) {
  if (running) return () => undefined;
  running = true;
  logger.info("starting host-start LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    let ops: LroSummary[] = [];
    try {
      ops = await claimLroOps({
        kind: HOST_START_LRO_KIND,
        owner_type: OWNER_TYPE,
        owner_id: WORKER_ID,
        limit: Math.max(1, maxParallel - inFlight),
        lease_ms: LEASE_MS,
      });
    } catch (err) {
      logger.warn("host-start claim failed", { err });
      return;
    }
    for (const claimed of ops) {
      inFlight += 1;
      void handleOp(claimed)
        .catch(async (err) => {
          logger.warn("host-start handler failed", {
            op_id: claimed.op_id,
            err,
          });
          const updated = await updateLro({
            op_id: claimed.op_id,
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
