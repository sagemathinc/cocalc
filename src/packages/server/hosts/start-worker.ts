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
import {
  deleteHostInternal,
  forceDeprovisionHostInternal,
  removeSelfHostConnectorInternal,
  restartHostInternal,
  startHostInternal,
  stopHostInternal,
} from "@cocalc/server/conat/api/hosts";

const logger = getLogger("server:hosts:ops-worker");

const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 2;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 5_000;

const HOST_OP_KINDS = [
  "host-start",
  "host-stop",
  "host-restart",
  "host-deprovision",
  "host-delete",
  "host-force-deprovision",
  "host-remove-connector",
] as const;

type HostOpKind = (typeof HOST_OP_KINDS)[number];

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  requesting: 35,
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

async function waitForHostStatus({
  host_id,
  desired,
  failOn,
  allowDeleted,
  onUpdate,
}: {
  host_id: string;
  desired: string[];
  failOn?: string[];
  allowDeleted?: boolean;
  onUpdate: (status: string, metadata?: any) => Promise<void>;
}) {
  const startedAt = Date.now();
  let lastStatus = "";
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const row = await loadHostStatus(host_id);
    if (!row) {
      throw new Error("host not found");
    }
    if (row.deleted) {
      if (allowDeleted) {
        return { status: "deleted", metadata: row.metadata ?? {}, deleted: true };
      }
      throw new Error("host deleted");
    }
    const status = String(row.status ?? "");
    if (status && status !== lastStatus) {
      lastStatus = status;
      await onUpdate(status, row.metadata ?? {});
    }
    if (desired.includes(status)) {
      return { status, metadata: row.metadata ?? {} };
    }
    if (failOn && failOn.includes(status)) {
      const lastError = row.metadata?.last_error;
      throw new Error(lastError ? `host ${status}: ${lastError}` : `host ${status}`);
    }
    await delay(POLL_MS);
  }
  throw new Error(`timeout waiting for host: ${desired.join(", ")}`);
}

function opLabel(kind: HostOpKind, input: any): string {
  switch (kind) {
    case "host-start":
      return "Start";
    case "host-stop":
      return "Stop";
    case "host-restart":
      return input?.mode === "hard" ? "Hard restart" : "Restart";
    case "host-deprovision":
      return "Deprovision";
    case "host-delete":
      return "Delete";
    case "host-force-deprovision":
      return "Force deprovision";
    case "host-remove-connector":
      return "Remove connector";
    default:
      return "Host op";
  }
}

function waitConfig(kind: HostOpKind) {
  switch (kind) {
    case "host-start":
      return {
        desired: ["running"],
        failOn: ["error", "off", "deprovisioned"],
        message: "waiting for host to be running",
      };
    case "host-stop":
      return {
        desired: ["off", "deprovisioned"],
        failOn: ["error"],
        message: "waiting for host to stop",
      };
    case "host-restart":
      return {
        desired: ["running"],
        failOn: ["error", "deprovisioned"],
        message: "waiting for host to restart",
      };
    case "host-deprovision":
      return {
        desired: ["deprovisioned"],
        failOn: ["error"],
        message: "waiting for deprovision",
      };
    case "host-delete":
      return {
        desired: [],
        failOn: ["error"],
        allowDeleted: true,
        message: "waiting for host deletion",
      };
    case "host-force-deprovision":
      return {
        desired: ["deprovisioned"],
        failOn: ["error"],
        message: "waiting for force deprovision",
      };
    case "host-remove-connector":
      return {
        desired: ["deprovisioned"],
        failOn: ["error"],
        message: "waiting for connector removal",
      };
    default:
      return {
        desired: ["running"],
        failOn: ["error"],
        message: "waiting for host",
      };
  }
}

async function runHostAction(kind: HostOpKind, host_id: string, account_id: string, input: any) {
  switch (kind) {
    case "host-start":
      await startHostInternal({ account_id, id: host_id });
      return;
    case "host-stop":
      await stopHostInternal({ account_id, id: host_id });
      return;
    case "host-restart":
      await restartHostInternal({
        account_id,
        id: host_id,
        mode: input?.mode === "hard" ? "hard" : "reboot",
      });
      return;
    case "host-deprovision":
    case "host-delete":
      await deleteHostInternal({ account_id, id: host_id });
      return;
    case "host-force-deprovision":
      await forceDeprovisionHostInternal({ account_id, id: host_id });
      return;
    case "host-remove-connector":
      await removeSelfHostConnectorInternal({ account_id, id: host_id });
      return;
    default:
      throw new Error(`unsupported host op: ${kind}`);
  }
}

async function handleOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const host_id = op.scope_id ?? input.id;
  const account_id = op.created_by ?? input.account_id;
  const kind = op.kind as HostOpKind;

  if (!HOST_OP_KINDS.includes(kind)) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `unsupported host op kind: ${op.kind}`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  if (!host_id || !account_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `${kind} op missing host or account`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("host op heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let lastStep: string | null = null;
  const progressStep = async (step: string, message: string, detail?: any) => {
    if (step === lastStep) {
      return;
    }
    lastStep = step;
    logger.info("host op step", { op_id, kind, step, message, detail });
    progressEvent({ op, step, message, detail });
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      () => {},
    );
    await updateProgressSummary(op, { step, detail }).catch(() => {});
  };

  try {
    const running = await updateLro({
      op_id,
      status: "running",
      error: null,
    });
    if (running) {
      await publishSummary(running);
    }

    const actionLabel = opLabel(kind, input);
    const actionLower = actionLabel.toLowerCase();
    await progressStep("requesting", `requesting ${actionLower}`, {
      host_id,
      action: actionLower,
    });
    await runHostAction(kind, host_id, account_id, input);

    const wait = waitConfig(kind);
    await progressStep("waiting", wait.message, { host_id });
    const final = await waitForHostStatus({
      host_id,
      desired: wait.desired,
      failOn: wait.failOn,
      allowDeleted: wait.allowDeleted,
      onUpdate: async (status, metadata) => {
        logger.debug("host op status update", {
          op_id,
          kind,
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
    await progressStep("done", `${actionLower} complete`, {
      host_id,
      status: final.status,
    });
  } catch (err) {
    logger.warn("host op failed", { op_id, kind, err: `${err}` });
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: `${err}`,
    });
    if (updated) {
      await publishSummary(updated);
    }
    await progressStep("done", "operation failed", {
      host_id,
      error: `${err}`,
    });
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
  logger.info("starting host ops LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    for (const kind of HOST_OP_KINDS) {
      if (inFlight >= maxParallel) break;
      let ops: LroSummary[] = [];
      try {
        ops = await claimLroOps({
          kind,
          owner_type: OWNER_TYPE,
          owner_id: WORKER_ID,
          limit: Math.max(1, maxParallel - inFlight),
          lease_ms: LEASE_MS,
        });
      } catch (err) {
        logger.warn("host op claim failed", { kind, err });
        continue;
      }
      for (const claimed of ops) {
        inFlight += 1;
        void handleOp(claimed)
          .catch(async (err) => {
            logger.warn("host op handler failed", {
              op_id: claimed.op_id,
              kind: claimed.kind,
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
