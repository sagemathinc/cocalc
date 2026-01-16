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

export type MoveProjectToHostInput = {
  project_id: string;
  dest_host_id?: string;
  account_id: string;
};

type MoveProjectContext = {
  project_id: string;
  dest_host_id: string;
  account_id: string;
  project_region: string;
  dest_region: string;
  project_host_id?: string | null;
  project_state?: string | null;
};

export type MoveProjectProgressUpdate = {
  step: string;
  message?: string;
  detail?: Record<string, any>;
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
  }>(
    "SELECT project_id, host_id, region, state->>'state' AS project_state FROM projects WHERE project_id=$1",
    [project_id],
  );
  const projectRow = projectResult.rows[0];
  if (!projectRow) {
    throw new Error(`project ${project_id} not found`);
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
  };
}

export async function moveProjectToHost(
  input: MoveProjectToHostInput,
  opts?: { progress?: (update: MoveProjectProgressUpdate) => void },
): Promise<void> {
  const progress = opts?.progress ?? (() => {});
  const context = await buildMoveProjectContext(input);
  log.debug("moveProjectToHost context", {
    project_id: context.project_id,
    dest_host_id: context.dest_host_id,
    project_region: context.project_region,
    dest_region: context.dest_region,
    project_host_id: context.project_host_id,
    project_state: context.project_state,
  });
  progress({
    step: "validate",
    message: "validated move request",
    detail: {
      source_host_id: context.project_host_id ?? undefined,
      dest_host_id: context.dest_host_id,
    },
  });
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
  if (
    context.project_host_id &&
    context.project_host_id !== context.dest_host_id
  ) {
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
}
