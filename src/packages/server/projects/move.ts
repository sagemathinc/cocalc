import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
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
  startProjectOnHost,
  stopProjectOnHost,
} from "../project-host/control";
import { createBackup } from "../conat/api/project-backups";

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
  last_backup?: string | null;
  last_edited?: string | null;
  project_state?: string | null;
};

export type MoveProjectProgressUpdate = {
  step: string;
  message?: string;
  detail?: Record<string, any>;
};

async function buildMoveProjectContext(
  input: MoveProjectToHostInput,
): Promise<MoveProjectContext> {
  const { project_id, account_id } = input;
  const pool = getPool();
  const projectResult = await pool.query<{
    project_id: string;
    host_id: string | null;
    region: string | null;
    last_backup: string | null;
    last_edited: string | null;
    project_state: string | null;
  }>(
    "SELECT project_id, host_id, region, last_backup, last_edited, state->>'state' AS project_state FROM projects WHERE project_id=$1",
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
    last_backup: projectRow.last_backup,
    last_edited: projectRow.last_edited,
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
    last_backup: context.last_backup,
    last_edited: context.last_edited,
  });
  progress({
    step: "validate",
    message: "validated move request",
    detail: {
      source_host_id: context.project_host_id ?? undefined,
      dest_host_id: context.dest_host_id,
    },
  });
  const projectRunning = ["running", "starting"].includes(
    String(context.project_state ?? ""),
  );
  if (projectRunning) {
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
  } else {
    progress({
      step: "stop-source",
      message: "source project already stopped",
      detail: { project_state: context.project_state },
    });
    log.info("moveProjectToHost skip stop (project not running)", {
      project_id: context.project_id,
      project_state: context.project_state,
    });
  }
  const lastEdited =
    context.last_edited != null ? new Date(context.last_edited) : undefined;
  const lastBackup =
    context.last_backup != null ? new Date(context.last_backup) : undefined;
  const backupNeeded =
    !lastBackup || (lastEdited && lastEdited > lastBackup);
  log.info("moveProjectToHost backup requirement", {
    project_id: context.project_id,
    backup_needed: backupNeeded,
    last_backup: lastBackup ? lastBackup.toISOString() : null,
    last_edited: lastEdited ? lastEdited.toISOString() : null,
  });
  if (backupNeeded) {
    progress({
      step: "backup",
      message: "creating backup snapshot",
      detail: {
        last_backup: lastBackup ? lastBackup.toISOString() : null,
        last_edited: lastEdited ? lastEdited.toISOString() : null,
      },
    });
    log.info("moveProjectToHost creating backup", {
      project_id: context.project_id,
    });
    try {
      const backup = await createBackup({
        account_id: context.account_id,
        project_id: context.project_id,
      });
      progress({
        step: "backup",
        message: "backup created",
        detail: {
          backup_id: backup.id,
          backup_time: backup.time.toISOString(),
        },
      });
      log.info("moveProjectToHost backup created", {
        project_id: context.project_id,
      });
    } catch (err) {
      log.error("moveProjectToHost backup failed", {
        project_id: context.project_id,
        err,
      });
      throw err;
    }
  } else {
    progress({
      step: "backup",
      message: "backup already current",
      detail: {
        last_backup: lastBackup ? lastBackup.toISOString() : null,
        last_edited: lastEdited ? lastEdited.toISOString() : null,
      },
    });
    log.info("moveProjectToHost backup not needed", {
      project_id: context.project_id,
    });
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
    await startProjectOnHost(context.project_id);
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
