import { randomUUID } from "node:crypto";
import { delay } from "awaiting";
import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import getPool from "@cocalc/database/pool";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import { waitForCompletion as waitForLroCompletion } from "@cocalc/conat/lro/client";
import {
  claimLroOps,
  createLro,
  getLro,
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
  upgradeHostSoftwareInternal,
} from "@cocalc/server/conat/api/hosts";

const logger = getLogger("server:hosts:ops-worker");

const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 2;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 5_000;
const BACKUP_PARALLEL = 6;
const BACKUP_WAIT_MS = 6 * 60 * 60 * 1000;
const BACKUP_PROGRESS_MAX = 60;
const BACKUP_LRO_KIND = "project-backup";

const HOST_OP_KINDS = [
  "host-start",
  "host-stop",
  "host-restart",
  "host-upgrade-software",
  "host-deprovision",
  "host-delete",
  "host-force-deprovision",
  "host-remove-connector",
] as const;

type HostOpKind = (typeof HOST_OP_KINDS)[number];

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  backups: 20,
  requesting: 35,
  waiting: 75,
  done: 100,
  canceled: 100,
};

type HostProjectRow = {
  project_id: string;
  last_edited: Date | null;
  last_backup: Date | null;
  state: { state?: string } | null;
  provisioned?: boolean | null;
};

type BackupCandidate = {
  project_id: string;
  reason: "running" | "dirty";
};

class HostOpCanceledError extends Error {
  code = "host-op-canceled";

  constructor(message = "host op canceled") {
    super(message);
  }
}

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
  progress,
}: {
  op: LroSummary;
  step: string;
  message: string;
  detail?: any;
  progress?: number;
}) {
  const resolved =
    progress ?? (progressSteps[step] != null ? progressSteps[step] : undefined);
  void publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: step,
      message,
      progress: resolved,
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
    "SELECT id, status, metadata, deleted, last_seen FROM project_hosts WHERE id=$1",
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

async function waitForHostHeartbeat({
  host_id,
  since,
}: {
  host_id: string;
  since: number;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const row = await loadHostStatus(host_id);
    if (!row || row.deleted) {
      throw new Error("host not found");
    }
    const lastSeen = row.last_seen ? new Date(row.last_seen as any).getTime() : 0;
    if (lastSeen && lastSeen >= since) {
      return { last_seen: row.last_seen };
    }
    await delay(POLL_MS);
  }
  throw new Error("timeout waiting for host heartbeat");
}

async function loadHostProjects(host_id: string): Promise<HostProjectRow[]> {
  const { rows } = await getPool().query<HostProjectRow>(
    `
      SELECT project_id, last_edited, last_backup, state, provisioned
      FROM projects
      WHERE host_id=$1
        AND deleted IS NOT true
    `,
    [host_id],
  );
  return rows;
}

function isProjectRunning(state?: string | null): boolean {
  return state === "running" || state === "starting";
}

function needsBackup(row: HostProjectRow): BackupCandidate | undefined {
  const state = row.state?.state ?? null;
  if (isProjectRunning(state)) {
    return { project_id: row.project_id, reason: "running" };
  }
  if (!row.provisioned) {
    return undefined;
  }
  const lastEdited = row.last_edited ? new Date(row.last_edited).getTime() : 0;
  const lastBackup = row.last_backup ? new Date(row.last_backup).getTime() : 0;
  if (!lastEdited) {
    return { project_id: row.project_id, reason: "dirty" };
  }
  if (!lastBackup || lastEdited > lastBackup) {
    return { project_id: row.project_id, reason: "dirty" };
  }
  return undefined;
}

async function createProjectBackupOp({
  project_id,
  account_id,
}: {
  project_id: string;
  account_id: string;
}): Promise<LroSummary> {
  const op = await createLro({
    kind: BACKUP_LRO_KIND,
    scope_type: "project",
    scope_id: project_id,
    created_by: account_id,
    routing: "hub",
    input: { project_id },
    status: "queued",
  });
  await publishLroSummary({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    summary: op,
  });
  publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: "queued",
      message: "queued",
      progress: 0,
    },
  }).catch(() => {});
  return op;
}

async function ensureHostBackups({
  host_id,
  account_id,
  skip_backups,
  progressStep,
  shouldCancel,
}: {
  host_id: string;
  account_id: string;
  skip_backups: boolean;
  progressStep: (
    step: string,
    message: string,
    detail?: any,
    progress?: number,
  ) => Promise<void>;
  shouldCancel: () => Promise<boolean>;
}): Promise<void> {
  if (await shouldCancel()) {
    throw new HostOpCanceledError();
  }
  const projects = await loadHostProjects(host_id);
  const assigned = projects.length;
  const provisioned = projects.filter((row) => row.provisioned).length;
  const running = projects.filter((row) =>
    isProjectRunning(row.state?.state ?? null),
  ).length;
  const skippedUnprovisioned = projects.filter(
    (row) => !row.provisioned && !isProjectRunning(row.state?.state ?? null),
  ).length;
  const candidates = projects
    .map((row) => needsBackup(row))
    .filter((row): row is BackupCandidate => !!row);
  if (!candidates.length) {
    if (assigned) {
      await progressStep("backups", "backups not needed", {
        host_id,
        assigned,
        provisioned,
        running,
        skipped_unprovisioned: skippedUnprovisioned,
      });
    }
    return;
  }

  if (skip_backups) {
    await progressStep("backups", "backups skipped", {
      host_id,
      assigned,
      provisioned,
      running,
      skipped_unprovisioned: skippedUnprovisioned,
      total: candidates.length,
      skipped: candidates.length,
    });
    return;
  }

  const statusRow = await loadHostStatus(host_id);
  const status = String(statusRow?.status ?? "");
  if (!["running", "starting", "restarting", "error"].includes(status)) {
    throw new Error("host is not running; use force to skip backups");
  }

  const total = candidates.length;
  let completed = 0;
  let failed = 0;

  const updateProgress = async () => {
    const done = completed + failed;
    const progress = total
      ? Math.round((done / total) * BACKUP_PROGRESS_MAX)
      : 0;
    const skippedNote = skippedUnprovisioned
      ? ` (skipped ${skippedUnprovisioned})`
      : "";
    await progressStep(
      "backups",
      `backups ${done}/${total}${skippedNote}`,
      {
        host_id,
        assigned,
        provisioned,
        running,
        total,
        completed,
        failed,
        skipped_unprovisioned: skippedUnprovisioned,
      },
      progress,
    );
  };

  await updateProgress();

  const queue = [...candidates];
  let abortError: Error | null = null;
  const worker = async () => {
    while (queue.length && !abortError) {
      if (await shouldCancel()) {
        abortError = new HostOpCanceledError();
        throw abortError;
      }
      const next = queue.shift();
      if (!next) return;
      try {
        const backupOp = await createProjectBackupOp({
          project_id: next.project_id,
          account_id,
        });
        const summary = await waitForLroCompletion({
          op_id: backupOp.op_id,
          scope_type: backupOp.scope_type,
          scope_id: backupOp.scope_id,
          client: conat(),
          timeout_ms: BACKUP_WAIT_MS,
        });
        if (summary.status !== "succeeded") {
          throw new Error(
            summary.error ?? `backup ${summary.status} for ${next.project_id}`,
          );
        }
        completed += 1;
      } catch (err) {
        failed += 1;
        abortError = err as Error;
        throw err;
      } finally {
        await updateProgress();
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(BACKUP_PARALLEL, total) },
    () => worker(),
  );

  await Promise.all(workers);
}

function opLabel(kind: HostOpKind, input: any): string {
  switch (kind) {
    case "host-start":
      return "Start";
    case "host-stop":
      return "Stop";
    case "host-restart":
      return input?.mode === "hard" ? "Hard restart" : "Restart";
    case "host-upgrade-software":
      return "Upgrade";
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
        desired: ["deprovisioned"],
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

  let lastProgressKey: string | null = null;
  const progressStep = async (
    step: string,
    message: string,
    detail?: any,
    progress?: number,
  ) => {
    let detailKey = "";
    if (detail !== undefined) {
      try {
        detailKey = JSON.stringify(detail);
      } catch {
        detailKey = String(detail);
      }
    }
    const progressKey = `${step}|${message}|${detailKey}|${progress ?? ""}`;
    if (progressKey === lastProgressKey) {
      return;
    }
    lastProgressKey = progressKey;
    logger.info("host op step", { op_id, kind, step, message, detail });
    progressEvent({ op, step, message, detail, progress });
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      () => {},
    );
    await updateProgressSummary(op, { step, detail }).catch(() => {});
  };

  const cancelState = {
    lastCheck: 0,
    canceled: false,
  };

  const shouldCancel = async () => {
    if (cancelState.canceled) return true;
    const now = Date.now();
    if (now - cancelState.lastCheck < 2_000) {
      return cancelState.canceled;
    }
    cancelState.lastCheck = now;
    const latest = await getLro(op_id);
    cancelState.canceled = latest?.status === "canceled";
    return cancelState.canceled;
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

    if (await shouldCancel()) {
      throw new HostOpCanceledError();
    }

    const skipBackups = !!input?.skip_backups;
    const needsBackupPhase =
      kind === "host-stop" || kind === "host-deprovision";
    if (needsBackupPhase) {
      await ensureHostBackups({
        host_id,
        account_id,
        skip_backups: skipBackups,
        progressStep,
        shouldCancel,
      });
    }

    await progressStep("requesting", `requesting ${actionLower}`, {
      host_id,
      action: actionLower,
    });

    if (kind === "host-upgrade-software") {
      const upgradeStartedAt = Date.now();
      await progressStep("waiting", "running upgrade", {
        host_id,
        targets: input?.targets,
      });
      const response = await upgradeHostSoftwareInternal({
        account_id,
        id: host_id,
        targets: input?.targets ?? [],
        base_url: input?.base_url,
      });
      const requiresRestart = (response.results ?? []).some(
        (result) =>
          result.artifact === "project-host" && result.status === "updated",
      );
      if (requiresRestart) {
        const row = await loadHostStatus(host_id);
        const baselineSeen = row?.last_seen
          ? new Date(row.last_seen as any).getTime()
          : 0;
        const since = Math.max(baselineSeen, upgradeStartedAt);
        await progressStep("waiting", "waiting for host to return", {
          host_id,
        });
        await waitForHostHeartbeat({ host_id, since });
      }
      const updated = await updateLro({
        op_id,
        status: "succeeded",
        progress_summary: {
          phase: "done",
          host_id,
          results: response.results ?? [],
        },
        result: { host_id, ...response },
        error: null,
      });
      if (updated) {
        await publishSummary(updated);
      }
      await progressStep("done", "upgrade complete", {
        host_id,
        results: response.results ?? [],
      });
      return;
    }

    if (await shouldCancel()) {
      throw new HostOpCanceledError();
    }

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
    const canceled =
      err instanceof HostOpCanceledError ||
      (typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "host-op-canceled");
    if (canceled) {
      logger.info("host op canceled", { op_id, kind });
      const updated = await updateLro({
        op_id,
        status: "canceled",
        error: `${err}`,
      });
      if (updated) {
        await publishSummary(updated);
      }
      await progressStep("canceled", "operation canceled", {
        host_id,
      });
    } else {
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
    }
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
