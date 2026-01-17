import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
  parseR2Region,
} from "@cocalc/util/consts";
import {
  loadHostFromRegistry,
  selectActiveHost,
  deleteProjectDataOnHost,
  savePlacement,
  stopProjectOnHost,
} from "../project-host/control";
import { createBackup } from "../conat/api/project-backups";
import { start as startProjectLro } from "../conat/api/projects";
import { waitForCompletion as waitForLroCompletion } from "@cocalc/conat/lro/client";

const log = getLogger("server:projects:move");

export const MOVE_CANCELED_CODE = "move-canceled";

class MoveCanceledError extends Error {
  code = MOVE_CANCELED_CODE;
  stage: string;

  constructor(stage: string) {
    super(`move canceled (${stage})`);
    this.name = "MoveCanceledError";
    this.stage = stage;
  }
}

export type MoveProjectToHostInput = {
  project_id: string;
  dest_host_id?: string;
  account_id: string;
  allow_offline?: boolean;
};

type MoveProjectContext = {
  project_id: string;
  dest_host_id: string;
  account_id: string;
  project_region: string;
  dest_region: string;
  project_host_id?: string | null;
  project_state?: string | null;
  source_host_status?: string | null;
  source_host_deleted?: boolean;
  source_host_last_seen?: Date | null;
  last_backup?: Date | null;
  last_edited?: Date | null;
};

export type MoveProjectProgressUpdate = {
  step: string;
  message?: string;
  detail?: Record<string, any>;
  progress?: number;
};

async function revertPlacementIfPossible(
  context: MoveProjectContext,
  progress: (update: MoveProjectProgressUpdate) => void,
) {
  if (!context.project_host_id || context.project_host_id === context.dest_host_id) {
    return;
  }
  const sourceHost = await loadHostFromRegistry(context.project_host_id);
  if (!sourceHost) {
    progress({
      step: "revert-placement",
      message: "source host unavailable; placement not restored",
      detail: { source_host_id: context.project_host_id },
    });
    return;
  }
  progress({
    step: "revert-placement",
    message: "restoring source placement",
    detail: { source_host_id: context.project_host_id },
  });
  await savePlacement(context.project_id, {
    host_id: context.project_host_id,
    host: sourceHost,
  });
  progress({
    step: "revert-placement",
    message: "source placement restored",
    detail: { source_host_id: context.project_host_id },
  });
}

async function cleanupDestinationOnFailure(
  context: MoveProjectContext,
  progress: (update: MoveProjectProgressUpdate) => void,
) {
  if (!context.dest_host_id || context.dest_host_id === context.project_host_id) {
    return;
  }
  progress({
    step: "cleanup-dest",
    message: "removing destination data after failed move",
    detail: { dest_host_id: context.dest_host_id },
  });
  await deleteProjectDataOnHost({
    project_id: context.project_id,
    host_id: context.dest_host_id,
  });
  progress({
    step: "cleanup-dest",
    message: "destination data removed",
    detail: { dest_host_id: context.dest_host_id },
  });
}

async function buildMoveProjectContext(
  input: MoveProjectToHostInput,
): Promise<MoveProjectContext> {
  const { project_id, account_id } = input;
  const pool = getPool();
  const projectResult = await pool.query<{
    project_id: string;
    host_id: string | null;
    region: string | null;
    project_state: string | null;
    last_backup: Date | null;
    last_edited: Date | null;
  }>(
    "SELECT project_id, host_id, region, state->>'state' AS project_state, last_backup, last_edited FROM projects WHERE project_id=$1",
    [project_id],
  );
  const projectRow = projectResult.rows[0];
  if (!projectRow) {
    throw new Error(`project ${project_id} not found`);
  }
  let source_host_status: string | null = null;
  let source_host_deleted = false;
  let source_host_last_seen: Date | null = null;
  if (projectRow.host_id) {
    const hostResult = await pool.query<{
      status: string | null;
      deleted: Date | null;
      last_seen: Date | null;
    }>("SELECT status, deleted, last_seen FROM project_hosts WHERE id=$1", [
      projectRow.host_id,
    ]);
    const hostRow = hostResult.rows[0];
    if (hostRow) {
      source_host_status = hostRow.status ?? null;
      source_host_deleted = !!hostRow.deleted;
      source_host_last_seen = hostRow.last_seen ?? null;
    }
  }
  let dest_host_id = input.dest_host_id;
  const destHost =
    dest_host_id != null
      ? await loadHostFromRegistry(dest_host_id)
      : await selectActiveHost(projectRow.host_id ?? undefined);
  if (!destHost) {
    throw new Error(
      dest_host_id
        ? `host ${dest_host_id} not found`
        : "no running project-host available",
    );
  }
  if (!dest_host_id) {
    dest_host_id = (destHost as { id?: string }).id;
  }
  if (!dest_host_id) {
    throw new Error("destination host id not available");
  }
  const project_region =
    parseR2Region(projectRow.region) ?? DEFAULT_R2_REGION;
  const dest_region = mapCloudRegionToR2Region(destHost.region);
  if (project_region !== dest_region) {
    throw new Error(
      `project region ${project_region} does not match host region ${dest_region}`,
    );
  }
  return {
    project_id,
    dest_host_id,
    account_id,
    project_region,
    dest_region,
    project_host_id: projectRow.host_id,
    project_state: projectRow.project_state,
    source_host_status,
    source_host_deleted,
    source_host_last_seen,
    last_backup: projectRow.last_backup,
    last_edited: projectRow.last_edited,
  };
}

const HOST_SEEN_TTL_MS = 2 * 60 * 1000;
const OFFLINE_MOVE_CONFIRM_CODE = "MOVE_OFFLINE_CONFIRMATION_REQUIRED";

function isSourceHostAvailable(context: MoveProjectContext): boolean {
  if (!context.project_host_id) return false;
  if (context.source_host_deleted) return false;
  const status = String(context.source_host_status ?? "");
  if (!["running", "starting", "restarting", "error"].includes(status)) {
    return false;
  }
  const lastSeenMs = context.source_host_last_seen?.getTime?.() ?? 0;
  if (!lastSeenMs) {
    return false;
  }
  return Date.now() - lastSeenMs <= HOST_SEEN_TTL_MS;
}

function hasStaleBackup(context: MoveProjectContext): boolean {
  const lastEdited = context.last_edited?.getTime?.() ?? 0;
  if (!lastEdited) return false;
  const lastBackup = context.last_backup?.getTime?.() ?? 0;
  return !lastBackup || lastEdited > lastBackup;
}

export async function moveProjectToHost(
  input: MoveProjectToHostInput,
  opts?: {
    progress?: (update: MoveProjectProgressUpdate) => void;
    shouldCancel?: () => Promise<boolean>;
  },
): Promise<void> {
  const progress = opts?.progress ?? (() => {});
  const shouldCancel = opts?.shouldCancel;
  const context = await buildMoveProjectContext(input);
  log.debug("moveProjectToHost context", {
    project_id: context.project_id,
    dest_host_id: context.dest_host_id,
    project_region: context.project_region,
    dest_region: context.dest_region,
    project_host_id: context.project_host_id,
    project_state: context.project_state,
    source_host_status: context.source_host_status,
    source_host_last_seen: context.source_host_last_seen,
    last_backup: context.last_backup,
    last_edited: context.last_edited,
  });

  let placementUpdated = false;
  const checkCanceled = async (stage: string) => {
    if (!shouldCancel) {
      return;
    }
    if (await shouldCancel()) {
      throw new MoveCanceledError(stage);
    }
  };

  const handleCancel = async (stage: string) => {
    log.info("moveProjectToHost canceled", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
      stage,
    });
    if (placementUpdated) {
      try {
        await revertPlacementIfPossible(context, progress);
      } catch (err) {
        log.warn("moveProjectToHost cancel placement revert failed", {
          project_id: context.project_id,
          source_host_id: context.project_host_id,
          err,
        });
        progress({
          step: "revert-placement",
          message: "source placement revert failed",
          detail: { source_host_id: context.project_host_id, error: `${err}` },
        });
      }
      try {
        await cleanupDestinationOnFailure(context, progress);
      } catch (cleanupErr) {
        log.warn("moveProjectToHost cancel destination cleanup failed", {
          project_id: context.project_id,
          dest_host_id: context.dest_host_id,
          err: cleanupErr,
        });
        progress({
          step: "cleanup-dest",
          message: "destination cleanup failed",
          detail: { dest_host_id: context.dest_host_id, error: `${cleanupErr}` },
        });
      }
    }
    progress({
      step: "done",
      message: "canceled",
      detail: { stage },
    });
  };

  try {
  progress({
    step: "validate",
    message: "validated move request",
    detail: {
      source_host_id: context.project_host_id ?? undefined,
      dest_host_id: context.dest_host_id,
    },
  });
  await checkCanceled("validate");
  const sourceAvailable = isSourceHostAvailable(context);
  if (!sourceAvailable) {
    const status = context.source_host_status ?? "unknown";
    progress({
      step: "stop-source",
      message: "source host offline; skipping stop",
      detail: { source_host_status: status },
    });
    if (hasStaleBackup(context) && !input.allow_offline) {
      const detail = `source host is offline (status=${status}) and last backup is older than last edit (last_backup=${
        context.last_backup?.toISOString?.() ?? context.last_backup ?? "none"
      }, last_edited=${
        context.last_edited?.toISOString?.() ?? context.last_edited ?? "unknown"
      })`;
      throw new Error(`${OFFLINE_MOVE_CONFIRM_CODE}: ${detail}`);
    }
    progress({
      step: "backup",
      message: "source host offline; using existing backup",
      detail: {
        source_host_status: status,
        last_backup: context.last_backup,
        last_edited: context.last_edited,
      },
    });
  } else {
    progress({
      step: "stop-source",
      message: "stopping source project",
      detail: { project_state: context.project_state },
    });
    log.info("moveProjectToHost stopping project before move", {
      project_id: context.project_id,
      project_state: context.project_state,
    });
    try {
      await stopProjectOnHost(context.project_id);
    } catch (err) {
      log.error("moveProjectToHost failed to stop project", {
        project_id: context.project_id,
        project_state: context.project_state,
        err,
      });
      throw err;
    }
    await checkCanceled("stop-source");

    progress({
      step: "backup",
      message: "creating final backup (always)",
    });
    log.info("moveProjectToHost creating final backup", {
      project_id: context.project_id,
    });
    try {
      const backupOp = await createBackup({
        account_id: context.account_id,
        project_id: context.project_id,
      });
      const backupStart = Date.now();
      const summary = await waitForLroCompletion({
        op_id: backupOp.op_id,
        scope_type: backupOp.scope_type,
        scope_id: backupOp.scope_id,
        client: conat(),
      });
      if (summary.status !== "succeeded") {
        const reason = summary.error ?? summary.status;
        throw new Error(`backup failed: ${reason}`);
      }
      const result = summary.result ?? {};
      const backup_id = result.id ?? result.backup_id;
      const backup_time = result.time ?? result.backup_time;
      const duration_ms = Date.now() - backupStart;
      progress({
        step: "backup",
        message: "final backup created",
        detail: {
          backup_id,
          backup_time,
          duration_ms,
        },
      });
      log.info("moveProjectToHost backup created", {
        project_id: context.project_id,
        backup_id,
        duration_ms,
      });
    } catch (err) {
      log.error("moveProjectToHost backup failed", {
        project_id: context.project_id,
        err,
      });
      throw err;
    }
    await checkCanceled("backup");
  }

  const destHost = await loadHostFromRegistry(context.dest_host_id);
  if (!destHost) {
    throw new Error(`host ${context.dest_host_id} not found`);
  }
  progress({
    step: "placement",
    message: "updating project placement",
    detail: { dest_host_id: context.dest_host_id },
  });
  try {
    await savePlacement(context.project_id, {
      host_id: context.dest_host_id,
      host: destHost,
    });
    placementUpdated = true;
    log.info("moveProjectToHost placement updated", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
    });
  } catch (err) {
    log.error("moveProjectToHost placement update failed", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
      err,
    });
    throw err;
  }
  await checkCanceled("placement");
  progress({
    step: "start-dest",
    message: "starting project on destination host",
    detail: { dest_host_id: context.dest_host_id },
  });
  try {
    const startOp = await startProjectLro({
      account_id: context.account_id,
      project_id: context.project_id,
      wait: false,
    });
    const summary = await waitForLroCompletion({
      op_id: startOp.op_id,
      scope_type: startOp.scope_type,
      scope_id: startOp.scope_id,
      client: conat(),
      onProgress: (event) => {
        progress({
          step: "start-dest",
          message: event.message ?? event.phase ?? "starting destination",
          detail: event.detail,
          progress: event.progress,
        });
      },
    });
    if (summary.status !== "succeeded") {
      const reason = summary.error ?? summary.status;
      throw new Error(`destination start failed: ${reason}`);
    }
    progress({
      step: "start-dest",
      message: "destination project started",
      detail: { dest_host_id: context.dest_host_id },
    });
    log.info("moveProjectToHost started project on destination host", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
    });
  } catch (err) {
    if ((err as any)?.code === MOVE_CANCELED_CODE) {
      throw err;
    }
    log.warn("moveProjectToHost start failed after placement update", {
      project_id: context.project_id,
      dest_host_id: context.dest_host_id,
      err,
    });
    progress({
      step: "start-dest",
      message: "destination start failed",
      detail: { dest_host_id: context.dest_host_id, error: `${err}` },
    });
    try {
      await revertPlacementIfPossible(context, progress);
    } catch (revertErr) {
      log.warn("moveProjectToHost placement revert failed", {
        project_id: context.project_id,
        source_host_id: context.project_host_id,
        err: revertErr,
      });
      progress({
        step: "revert-placement",
        message: "source placement revert failed",
        detail: { source_host_id: context.project_host_id, error: `${revertErr}` },
      });
    }
    try {
      await cleanupDestinationOnFailure(context, progress);
    } catch (cleanupErr) {
      log.warn("moveProjectToHost destination cleanup failed", {
        project_id: context.project_id,
        dest_host_id: context.dest_host_id,
        err: cleanupErr,
      });
      progress({
        step: "cleanup-dest",
        message: "destination cleanup failed",
        detail: { dest_host_id: context.dest_host_id, error: `${cleanupErr}` },
      });
    }
    throw err;
  }
  await checkCanceled("start-dest");
  if (
    context.project_host_id &&
    context.project_host_id !== context.dest_host_id
  ) {
    await checkCanceled("cleanup");
    if (!sourceAvailable) {
      progress({
        step: "cleanup",
        message: "source host offline; cleanup deferred",
        detail: { source_host_id: context.project_host_id },
      });
    } else {
      progress({
        step: "cleanup",
        message: "removing source data",
        detail: { source_host_id: context.project_host_id },
      });
      try {
        await deleteProjectDataOnHost({
          project_id: context.project_id,
          host_id: context.project_host_id,
        });
        progress({
          step: "cleanup",
          message: "source data removed",
          detail: { source_host_id: context.project_host_id },
        });
      } catch (err) {
        log.warn("moveProjectToHost cleanup failed", {
          project_id: context.project_id,
          source_host_id: context.project_host_id,
          err,
        });
        progress({
          step: "cleanup",
          message: "source cleanup failed",
          detail: { source_host_id: context.project_host_id, error: `${err}` },
        });
      }
    }
  } else {
    progress({
      step: "cleanup",
      message: "no source cleanup needed",
      detail: { source_host_id: context.project_host_id ?? undefined },
    });
  }
  progress({
    step: "done",
    message: "move complete",
    detail: { dest_host_id: context.dest_host_id },
  });
  } catch (err) {
    if ((err as any)?.code === MOVE_CANCELED_CODE) {
      await handleCancel((err as any).stage ?? "unknown");
      throw err;
    }
    throw err;
  }
}
